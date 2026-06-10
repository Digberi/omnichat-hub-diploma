import { InjectQueue } from "@nestjs/bullmq"
import { Inject, Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { Queue } from "bullmq"
import { PinoLogger } from "nestjs-pino"
import { applyIncomingMessageEffects } from "@omnichat/domain"
import { Prisma } from "@omnichat/db"
import { ENVELOPE_CRYPTO } from "@omnichat/kms/nest"
import type { EnvelopeCryptoService } from "@omnichat/kms"

import { PrismaService } from "../prisma/prisma.service"

const OLX_DEFAULT_BASE_URL = "https://www.olx.ua"
const OLX_DEFAULT_TIMEOUT_MS = 10_000
const OLX_THREADS_PATH = "/api/partner/threads"
const OLX_OAUTH_TOKEN_PATH = "/api/open/oauth/token"

type OlxAuthData = { accessToken: string; refreshToken?: string | null }

// Per OLX UA Partner API v2 swagger (Thread schema), foreign keys are flat
// snake_case integers: `advert_id`, `interlocutor_id`. We previously typed
// them as nested objects (`advert.id`, `interlocutor.id`) — that shape
// doesn't exist in production responses, so every advert lookup silently
// returned null and every conversation got "OLX buyer" without a real
// name. Keep the nested fields too as a back-compat read path in case a
// future API version (or expanded response) ever returns them.
type OlxThread = {
  id: number | string
  advert_id?: number | string | null
  interlocutor_id?: number | string | null
  interlocutor?: { id?: number | string; name?: string | null } | null
  advert?: { id?: number | string; title?: string | null } | null
}

function readAdvertId(thread: OlxThread): string | null {
  if (thread.advert_id != null) return String(thread.advert_id)
  if (thread.advert?.id != null) return String(thread.advert.id)
  return null
}

function readInterlocutorId(thread: OlxThread): string | null {
  if (thread.interlocutor_id != null) return String(thread.interlocutor_id)
  if (thread.interlocutor?.id != null) return String(thread.interlocutor.id)
  return null
}

type OlxAttachmentRef = { name?: string | null; url?: string | null }
type OlxMessage = {
  id: number | string
  thread_id?: number | string
  // Per OLX UA Partner API v2 swagger (Message schema): direction is on the
  // `type` field, "sent" means authored by the seller (us), "received" means
  // from the buyer / system. We previously checked `author.is_self` which
  // doesn't exist on the real payload, so every message — including the
  // seller's own replies — got tagged as IN, making `needsReply` stick
  // forever and breaking the inbox role rendering.
  type?: "sent" | "received" | string
  text?: string | null
  created_at?: string
  is_read?: boolean
  // attachments[] is the generic media list (photos, documents) and cvs[] is
  // the CV file list specific to Jobs threads. Both items only carry { name,
  // url } — OLX serves the content from their own CDN; there's no upload-id
  // or MIME metadata in the payload.
  attachments?: OlxAttachmentRef[] | null
  cvs?: OlxAttachmentRef[] | null
}

type OlxAttachmentMeta = {
  name: string | null
  url: string
  kind: "attachment" | "cv"
}

type OlxMessageAttachmentMetadata = {
  kind: "olx_message_attachments"
  schemaVersion: 1
  items: OlxAttachmentMeta[]
}

type OlxDeliveryNoticeMetadata = {
  kind: "olx_delivery_notice"
  schemaVersion: 1
  notice: string
  // Generic seller-delivery tab (fallback when we couldn't deep-link to the
  // specific advert).
  adminUrl: string
  // Optional advert enrichment — fetched from `/api/partner/adverts/{id}`
  // when the thread carries an `advert.id`. Lets the inbox render a card
  // closer to the Rozetka order card: product image + title + price + a
  // "Перейти до оголошення" button straight to the OLX advert page.
  // All fields may be null if the fetch failed (advert deleted, network
  // error, missing scope) — the card falls back to the original notice +
  // CTA.
  advert?: {
    id: string
    title: string | null
    imageUrl: string | null
    priceText: string | null
    advertUrl: string | null
  } | null
}

type OlxMessageMetadata = OlxMessageAttachmentMetadata | OlxDeliveryNoticeMetadata

// OLX-Доставка system messages arrive as plain `type:received` rows with no
// structural flag (confirmed by the v2 swagger — see Message schema lines
// 3302–3353: nothing like `is_system`, `sender_type`, `kind`). The only
// reliable signal is the Ukrainian/Russian root "OLX Доставк" appearing in
// the message body — covers "OLX Доставкою", "OLX Доставка", "OLX Доставки".
// We allow plain space, NBSP ( ), and narrow NBSP ( ) between the
// brand and the root word so different OLX message templates / browser
// rendering paths all match. Case-insensitive. We gate on `direction = 'IN'`
// at the call site, so seller-authored sentences like "Відправлю OLX
// Доставкою" don't get tagged as system notifications.
const OLX_DELIVERY_NOTICE_PATTERN = /OLX[   ]+Доставк/iu
const OLX_DELIVERY_SELLER_URL = "https://www.olx.ua/uk/myaccount/delivery/seller/"

function detectOlxDeliveryNotice(
  text: string,
  direction: "IN" | "OUT",
): OlxDeliveryNoticeMetadata | null {
  if (direction !== "IN") return null
  if (!text || text.length === 0) return null
  if (!OLX_DELIVERY_NOTICE_PATTERN.test(text)) return null
  return {
    kind: "olx_delivery_notice",
    schemaVersion: 1,
    notice: text.length > 500 ? `${text.slice(0, 500)}…` : text,
    adminUrl: OLX_DELIVERY_SELLER_URL,
  }
}

// Server-side defence: only persist attachment URLs whose scheme is http(s).
// The web bubble already filters again via `isHttpUrl`, but rejecting at the
// boundary means a compromised/malicious OLX response (or future schema drift)
// can't smuggle `javascript:` / `data:` / `file:` into the inbox.
function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function collectOlxAttachments(msg: OlxMessage): OlxAttachmentMeta[] {
  const out: OlxAttachmentMeta[] = []
  const push = (ref: OlxAttachmentRef | null | undefined, kind: "attachment" | "cv") => {
    if (!ref) return
    const url = typeof ref.url === "string" ? ref.url.trim() : ""
    if (!url || !isHttpUrl(url)) return
    const name = typeof ref.name === "string" && ref.name.trim().length > 0 ? ref.name.trim() : null
    out.push({ name, url, kind })
  }
  for (const ref of msg.attachments ?? []) push(ref, "attachment")
  for (const ref of msg.cvs ?? []) push(ref, "cv")
  return out
}

function attachmentPreviewFallback(items: OlxAttachmentMeta[]): string {
  // Worker stores this into `Message.text` when the OLX message had no text
  // body — fixes the empty conversation preview in the inbox list. The bubble
  // also reads `text` and would normally render it; we strip the placeholder
  // there to avoid duplicating the inline image/file.
  const allCv = items.every((i) => i.kind === "cv")
  if (allCv) return "\u{1F4CE} CV"
  const looksLikeImage = items.some((i) =>
    /\.(jpg|jpeg|png|gif|webp|bmp|avif)(\?|$)/i.test(i.url),
  )
  if (looksLikeImage) return "\u{1F4CE} Фото"
  const looksLikeVideo = items.some((i) =>
    /\.(mp4|mov|webm|m4v|mkv)(\?|$)/i.test(i.url),
  )
  if (looksLikeVideo) return "\u{1F4CE} Відео"
  return "\u{1F4CE} Вкладення"
}

type OlxThreadsResponse = { data?: OlxThread[]; links?: { next?: string | null } }
type OlxMessagesResponse = { data?: OlxMessage[] }

class OlxUnauthorized extends Error {
  constructor() {
    super("OLX UA returned 401")
    this.name = "OlxUnauthorized"
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "")
  const trimmedPath = path.startsWith("/") ? path : `/${path}`
  return `${trimmedBase}${trimmedPath}`
}

@Injectable()
export class OlxUaSyncService {
  private fetchFn: typeof globalThis.fetch = globalThis.fetch.bind(globalThis)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCryptoService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @InjectQueue("outbox.process") private readonly outboxQueue: Queue,
  ) {
    this.logger.setContext(OlxUaSyncService.name)
  }

  setFetch(fn: typeof globalThis.fetch): void {
    this.fetchFn = fn
  }

  async runTick(): Promise<void> {
    const max = Number(this.config.get<number>("CHANNEL_SYNC_OLX_MAX_ACCOUNTS") ?? 50)
    const limit = Number(this.config.get<number>("CHANNEL_SYNC_OLX_LIMIT") ?? 100)
    const timeoutMs = Number(this.config.get<number>("OLX_REQUEST_TIMEOUT_MS") ?? OLX_DEFAULT_TIMEOUT_MS)
    const baseUrl = String(this.config.get<string>("OLX_BASE_URL") ?? OLX_DEFAULT_BASE_URL).trim()

    const accounts = await this.prisma.channelAccount.findMany({
      where: {
        channel: "OLX",
        // OLX onboarding stores tokens via OAuth; legacy rows used "TOKEN" before
        // PR #46. Cover both so re-authorized OAuth accounts actually get polled.
        authType: { in: ["OAUTH", "TOKEN"] },
        isEnabled: true,
        authDataEncrypted: { not: null },
      },
      select: {
        id: true,
        workspaceId: true,
        externalAccountId: true,
        authDataEncrypted: true,
        syncCheckpoint: { select: { lastMessageAt: true } },
      },
      orderBy: [{ lastSyncAt: "asc" }, { id: "asc" }],
      take: max,
    })
    if (accounts.length === 0) return

    for (const account of accounts) {
      try {
        const auth = (await this.crypto.decrypt(
          account.workspaceId,
          String(account.authDataEncrypted),
        )) as OlxAuthData

        let currentAccess = auth.accessToken
        let threads: OlxThread[]
        try {
          threads = await this.fetchThreads({
            baseUrl,
            accessToken: currentAccess,
            limit,
            timeoutMs,
          })
        } catch (err) {
          if (err instanceof OlxUnauthorized && auth.refreshToken) {
            const refreshed = await this.refreshAccessToken({
              baseUrl,
              refreshToken: auth.refreshToken,
              timeoutMs,
            })
            currentAccess = refreshed.accessToken
            const enc = await this.crypto.encrypt(account.workspaceId, {
              schemaVersion: 1,
              provider: "OLX",
              workspaceId: account.workspaceId,
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken,
              tokenType: refreshed.tokenType,
              scope: refreshed.scope,
              expiresIn: refreshed.expiresIn,
              obtainedAt: new Date().toISOString(),
            })
            await this.prisma.channelAccount.update({
              where: { id: account.id },
              data: { authDataEncrypted: enc, lastError: null },
            })
            threads = await this.fetchThreads({
              baseUrl,
              accessToken: currentAccess,
              limit,
              timeoutMs,
            })
          } else {
            throw err
          }
        }

        const since = account.syncCheckpoint?.lastMessageAt ?? null
        let maxObservedSentAt: Date | null = since

        for (const thread of threads) {
          const messages = await this.fetchMessages({
            baseUrl,
            accessToken: currentAccess,
            threadId: String(thread.id),
            limit,
            timeoutMs,
          })

          for (const msg of messages) {
            const sentAt = msg.created_at ? new Date(msg.created_at) : null
            if (!sentAt || Number.isNaN(sentAt.getTime())) continue
            if (since && sentAt <= since) continue

            await this.upsertMessage({
              workspaceId: account.workspaceId,
              channelAccountId: account.id,
              thread,
              msg,
              sentAt,
              baseUrl,
              accessToken: currentAccess,
              timeoutMs,
            })

            if (!maxObservedSentAt || sentAt > maxObservedSentAt) {
              maxObservedSentAt = sentAt
            }
          }
        }

        if (maxObservedSentAt && (!since || maxObservedSentAt > since)) {
          await this.prisma.channelSyncCheckpoint.upsert({
            where: { channelAccountId: account.id },
            create: { channelAccountId: account.id, lastMessageAt: maxObservedSentAt },
            update: { lastMessageAt: maxObservedSentAt },
          })
        }
        await this.prisma.channelAccount.update({
          where: { id: account.id },
          data: { lastSyncAt: new Date(), lastError: null },
        })
      } catch (err) {
        const lastError = errorMessage(err).slice(0, 500)
        this.logger.warn(
          { channelAccountId: account.id, err: lastError },
          "OLX UA tick failed for account",
        )
        try {
          await this.prisma.channelAccount.update({
            where: { id: account.id },
            data: { lastError, lastSyncAt: new Date() },
          })
        } catch {
          // swallow secondary failure
        }
      }
    }
  }

  private async fetchThreads(input: {
    baseUrl: string
    accessToken: string
    limit: number
    timeoutMs: number
  }): Promise<OlxThread[]> {
    // Page through `links.next` so workspaces with >limit active threads don't
    // permanently shadow page 2+ once the checkpoint advances. Cap at 10 pages
    // (1000 threads/tick at the default limit) so a runaway response can't pin
    // the worker on a single account.
    const collected: OlxThread[] = []
    const seen = new Set<string>()
    let nextUrl: string | null = (() => {
      const u = new URL(joinUrl(input.baseUrl, OLX_THREADS_PATH))
      u.searchParams.set("limit", String(input.limit))
      return u.toString()
    })()
    let safety = 0
    while (nextUrl && safety < 10) {
      safety += 1
      const res = await this.fetchFn(nextUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          Accept: "application/json",
          Version: "2.0",
        },
        signal: AbortSignal.timeout(input.timeoutMs),
      })
      if (res.status === 401) throw new OlxUnauthorized()
      if (!res.ok) throw new Error(`OLX /api/partner/threads HTTP ${res.status}`)
      const body = (await res.json()) as OlxThreadsResponse
      for (const t of body.data ?? []) collected.push(t)
      const candidate = typeof body.links?.next === "string" ? body.links.next.trim() : null
      if (!candidate || seen.has(candidate)) {
        nextUrl = null
      } else {
        seen.add(candidate)
        nextUrl = candidate
      }
    }
    return collected
  }

  private async fetchMessages(input: {
    baseUrl: string
    accessToken: string
    threadId: string
    limit: number
    timeoutMs: number
  }): Promise<OlxMessage[]> {
    const url = new URL(joinUrl(input.baseUrl, `${OLX_THREADS_PATH}/${input.threadId}/messages`))
    url.searchParams.set("limit", String(input.limit))
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Accept: "application/json",
        Version: "2.0",
      },
      signal: AbortSignal.timeout(input.timeoutMs),
    })
    if (!res.ok) throw new Error(`OLX /threads/${input.threadId}/messages HTTP ${res.status}`)
    const body = (await res.json()) as OlxMessagesResponse
    return body.data ?? []
  }

  /**
   * Per-thread GET — the /threads listing trims `advert` (verified in prod:
   * 62/62 threads from the listing came back without `advert.id`). This
   * endpoint returns the full thread including the linked advert. Best-effort:
   * a null return keeps the surrounding feature in its bare/no-context state.
   */
  async fetchThread(input: {
    baseUrl: string
    accessToken: string
    threadId: string
    timeoutMs: number
  }): Promise<{ advertId: string | null } | null> {
    try {
      const url = new URL(joinUrl(input.baseUrl, `${OLX_THREADS_PATH}/${input.threadId}`))
      const res = await this.fetchFn(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          Accept: "application/json",
          Version: "2.0",
        },
        signal: AbortSignal.timeout(input.timeoutMs),
      })
      if (!res.ok) {
        this.logger.warn(
          { threadId: input.threadId, status: res.status },
          "olx /threads/{id} fetch failed; thread-level enrichment will skip",
        )
        return null
      }
      const body = (await res.json()) as {
        data?:
          | {
              advert_id?: number | string | null
              advert?: { id?: number | string | null } | null
            }
          | null
      }
      const data = body.data ?? null
      const advertId =
        data?.advert_id != null
          ? String(data.advert_id)
          : data?.advert?.id != null
            ? String(data.advert.id)
            : null
      return { advertId }
    } catch (err) {
      this.logger.warn(
        { threadId: input.threadId, err: errorMessage(err).slice(0, 200) },
        "olx /threads/{id} fetch threw; thread-level enrichment will skip",
      )
      return null
    }
  }

  /**
   * Best-effort fetch of advert details for delivery-notice enrichment. Per
   * OLX Partner v2 swagger §Adverts the response shape is
   * `{ data: Advert }` with `title`, `images[].url`, `price{value,currency}`,
   * `url`. We swallow all errors (advert deleted, scope missing, network
   * blip) and return null so the surrounding delivery-card code falls back
   * to the simpler text variant.
   */
  // Shared advert payload — both `Message.metadata.advert` (delivery notice card)
  // and `Conversation.context*` (sticky product header) read from this.
  async fetchAdvert(input: {
    baseUrl: string
    accessToken: string
    advertId: string
    timeoutMs: number
  }): Promise<{
    id: string
    title: string | null
    imageUrl: string | null
    priceText: string | null
    priceValue: number | null
    currency: string | null
    advertUrl: string | null
  } | null> {
    try {
      const url = new URL(joinUrl(input.baseUrl, `/api/partner/adverts/${input.advertId}`))
      const res = await this.fetchFn(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          Accept: "application/json",
          Version: "2.0",
        },
        signal: AbortSignal.timeout(input.timeoutMs),
      })
      if (!res.ok) {
        this.logger.warn(
          { advertId: input.advertId, status: res.status },
          "olx /adverts/{id} fetch failed; delivery card will skip advert enrichment",
        )
        return null
      }
      const body = (await res.json()) as {
        data?: {
          id?: number | string
          title?: string | null
          url?: string | null
          images?: Array<{ url?: string | null }> | null
          price?: { value?: number | string | null; currency?: string | null } | null
        } | null
      }
      const data = body.data ?? null
      if (!data) return null
      const firstImage = Array.isArray(data.images)
        ? data.images.find((i) => typeof i?.url === "string" && i.url.trim().length > 0)?.url ?? null
        : null
      const advertUrl = typeof data.url === "string" && data.url.trim().length > 0 ? data.url.trim() : null

      let priceValue: number | null = null
      let currency: string | null = null
      let priceText: string | null = null
      if (data.price && (data.price.value != null || data.price.currency != null)) {
        const rawValue =
          typeof data.price.value === "number"
            ? data.price.value
            : typeof data.price.value === "string"
              ? Number(data.price.value)
              : NaN
        priceValue = Number.isFinite(rawValue) ? Math.round(rawValue) : null
        currency =
          typeof data.price.currency === "string" && data.price.currency.trim().length > 0
            ? data.price.currency.trim()
            : null
        const valueStr =
          priceValue != null
            ? String(priceValue)
            : typeof data.price.value === "string"
              ? data.price.value
              : ""
        const composed = `${valueStr} ${currency ?? ""}`.trim()
        priceText = composed.length > 0 ? composed : null
      }

      return {
        id: String(data.id ?? input.advertId),
        title: typeof data.title === "string" && data.title.trim().length > 0 ? data.title.trim() : null,
        imageUrl: firstImage && isHttpUrl(firstImage) ? firstImage : null,
        priceText,
        priceValue,
        currency,
        advertUrl: advertUrl && isHttpUrl(advertUrl) ? advertUrl : null,
      }
    } catch (err) {
      this.logger.warn(
        { advertId: input.advertId, err: errorMessage(err).slice(0, 200) },
        "olx /adverts/{id} fetch threw; delivery card will skip advert enrichment",
      )
      return null
    }
  }

  private async refreshAccessToken(input: {
    baseUrl: string
    refreshToken: string
    timeoutMs: number
  }): Promise<{
    accessToken: string
    refreshToken: string
    expiresIn: number | null
    scope: string | null
    tokenType: string | null
  }> {
    const clientId = String(this.config.get<string>("OLX_CLIENT_ID") ?? "").trim()
    const clientSecret = String(this.config.get<string>("OLX_CLIENT_SECRET") ?? "").trim()
    if (!clientId || !clientSecret) {
      throw new Error("OLX refresh aborted: client_id/secret missing")
    }
    const res = await this.fetchFn(joinUrl(input.baseUrl, OLX_OAUTH_TOKEN_PATH), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(input.timeoutMs),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`OLX refresh HTTP ${res.status}: ${text.slice(0, 200)}`)
    const j = JSON.parse(text) as Record<string, unknown>
    const access = typeof j.access_token === "string" ? j.access_token : null
    if (!access) throw new Error("OLX refresh: no access_token in response")
    return {
      accessToken: access,
      refreshToken: typeof j.refresh_token === "string" ? j.refresh_token : input.refreshToken,
      expiresIn: typeof j.expires_in === "number" ? j.expires_in : null,
      scope: typeof j.scope === "string" ? j.scope : null,
      tokenType: typeof j.token_type === "string" ? j.token_type : null,
    }
  }

  private async upsertMessage(input: {
    workspaceId: string
    channelAccountId: string
    thread: OlxThread
    msg: OlxMessage
    sentAt: Date
    baseUrl: string
    accessToken: string
    timeoutMs: number
  }): Promise<void> {
    const threadIdStr = String(input.thread.id)
    const externalMessageId = String(input.msg.id)
    const direction: "IN" | "OUT" = input.msg.type === "sent" ? "OUT" : "IN"
    // OLX v2 spec doesn't expose buyer display name in the threads payload —
    // it's just `interlocutor_id`. The nested `interlocutor.name` was a stale
    // assumption; in prod every conversation comes through with the buyer
    // name unset and we fall back to "OLX buyer {id}". Fetching the user's
    // name would require a separate /users/{id} call we don't implement yet.
    const interlocutorId = readInterlocutorId(input.thread)
    const buyerName =
      input.thread.interlocutor?.name?.trim() ??
      (interlocutorId != null ? `OLX buyer ${interlocutorId}` : "OLX buyer")
    const externalBuyerId = interlocutorId ?? threadIdStr
    const rawText = String(input.msg.text ?? "")

    // OLX UA Partner v2 puts photos/documents in `attachments[]` and Jobs CVs
    // in `cvs[]`. Both surface as `{ name, url }` — content is hosted on OLX's
    // own CDN, no upload-id or MIME. We persist the URL list into
    // Message.metadata so the web inbox can render a clickable link / inline
    // thumbnail next to the text bubble (or replace the bubble entirely when
    // the message has no text — which is the empty-bubble bug). Skipping the
    // formal Attachment model on purpose: it requires storageKey/sizeBytes
    // that we'd have to fabricate. The structured-metadata pipeline already
    // exists for Rozetka order cards.
    const olxAttachments = collectOlxAttachments(input.msg)
    // OLX-Доставка system notifications take precedence — they always replace
    // the plain text bubble (operator sees a dedicated card with the
    // "Перейти до OLX Доставка" CTA). Attachments and delivery messages are
    // mutually exclusive in practice (OLX system messages are text-only), but
    // if both somehow appear we'd rather show the card; the attachment data
    // is preserved server-side and could be surfaced later by adding it to
    // the card design.
    let deliveryNotice = detectOlxDeliveryNotice(rawText, direction)

    // Fetch the OLX advert once per message and reuse the result for both the
    // delivery-notice card (Message.metadata.advert) and the sticky product
    // header (Conversation.context*). We need it when:
    //   (a) the message itself is an OLX-Доставка notice — the card embeds
    //       the product image/title/price;
    //   (b) the conversation has no context yet — lazy-fill on first message
    //       so older threads also get the sticky header.
    // (a) is always opportunistic. (b) is decided inside the transaction
    // below by checking `contextType IS NULL`; but the HTTP call must run
    // outside the transaction, so we pre-check the conversation here in a
    // cheap separate query. A race where another worker fills context
    // between this check and the transaction just results in a redundant
    // fetchAdvert — harmless.
    // Always check if the conversation needs context — we'll fall back to
    // per-thread GET to recover advert.id when the listing trimmed it (which
    // is what OLX actually does in production: backfill #1 showed 0/62 threads
    // had advert in the listing payload).
    const existing = await this.prisma.conversation.findFirst({
      where: {
        workspaceId: input.workspaceId,
        channelAccountId: input.channelAccountId,
        externalConversationId: threadIdStr,
      },
      select: { contextType: true },
    })
    const conversationNeedsContext = !existing || existing.contextType == null

    // Listing-advert first (cheap, free with the thread payload we already
    // have); per-thread GET fallback (one extra HTTP call) only when we need
    // it and the listing didn't have it. Skip both if nothing consumes it.
    let advertId = readAdvertId(input.thread)
    if (!advertId && (deliveryNotice || conversationNeedsContext)) {
      const t = await this.fetchThread({
        baseUrl: input.baseUrl,
        accessToken: input.accessToken,
        threadId: threadIdStr,
        timeoutMs: input.timeoutMs,
      })
      advertId = t?.advertId ?? null
    }
    const advert =
      advertId && (deliveryNotice || conversationNeedsContext)
        ? await this.fetchAdvert({
            baseUrl: input.baseUrl,
            accessToken: input.accessToken,
            advertId,
            timeoutMs: input.timeoutMs,
          })
        : null

    if (deliveryNotice && advert) {
      // Shape the advert down to the OlxDeliveryNoticeMeta.advert contract
      // (omit raw priceValue/currency that the card UI doesn't need).
      deliveryNotice = {
        ...deliveryNotice,
        advert: {
          id: advert.id,
          title: advert.title,
          imageUrl: advert.imageUrl,
          priceText: advert.priceText,
          advertUrl: advert.advertUrl,
        },
      }
    }
    const messageMetadata: OlxMessageMetadata | null = deliveryNotice
      ? deliveryNotice
      : olxAttachments.length > 0
        ? { kind: "olx_message_attachments", schemaVersion: 1, items: olxAttachments }
        : null

    // Context fields for Conversation row (sticky product header). Only set
    // when we have a fetched advert AND the conversation needs it. Builders
    // for both create and lazy-fill update paths.
    const contextFields =
      advert && conversationNeedsContext
        ? {
            contextType: "LISTING" as const,
            contextTitle: advert.title,
            contextPrice: advert.priceValue,
            contextCurrency: advert.currency,
            contextThumbUrl: advert.imageUrl,
            contextExternalUrl: advert.advertUrl,
            contextExternalId: advert.id,
          }
        : null

    // For attachment-only messages, store a short placeholder in `text` so the
    // conversation preview in the inbox list isn't blank ("📎 Фото" etc).
    // The bubble strips this placeholder when metadata.olx_message_attachments
    // is present, to avoid double-rendering above the inline image/file.
    const text = rawText.length === 0 && olxAttachments.length > 0
      ? attachmentPreviewFallback(olxAttachments)
      : rawText

    // Diagnostic: if a message has neither text nor attachments, surface what
    // OLX actually returned so we can grow the schema instead of dropping the
    // bubble. Kept after attachment modeling because OLX may add new payload
    // shapes (stickers, location pins) we haven't seen yet.
    if (rawText.length === 0 && olxAttachments.length === 0) {
      const rawMsg = input.msg as Record<string, unknown>
      this.logger.warn(
        {
          channelAccountId: input.channelAccountId,
          threadId: threadIdStr,
          msgId: externalMessageId,
          direction,
          msgKeys: Object.keys(rawMsg ?? {}).join(","),
          msgSample: JSON.stringify(rawMsg).slice(0, 800),
        },
        "olx message has neither text nor attachments; capture for schema discovery",
      )
    }

    const outboxIds = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let conversation = await tx.conversation.findFirst({
        where: {
          workspaceId: input.workspaceId,
          channelAccountId: input.channelAccountId,
          externalConversationId: threadIdStr,
        },
        select: {
          id: true,
          needsReply: true,
          isArchived: true,
          isPinnedInAll: true,
          snoozedUntil: true,
          contextType: true,
        },
      })
      if (!conversation) {
        conversation = await tx.conversation.create({
          data: {
            workspaceId: input.workspaceId,
            channelAccountId: input.channelAccountId,
            channel: "OLX",
            externalConversationId: threadIdStr,
            externalBuyerId,
            buyerDisplayName: buyerName,
            ...(contextFields ?? {}),
          },
          select: {
            id: true,
            needsReply: true,
            isArchived: true,
            isPinnedInAll: true,
            snoozedUntil: true,
            contextType: true,
          },
        })
      } else if (contextFields && conversation.contextType == null) {
        // Lazy-fill: existing conversation predates the context feature (or
        // was created before its advert was fetchable). Write context now so
        // the operator sees the product card from this point on.
        await tx.conversation.update({
          where: { id: conversation.id },
          data: contextFields,
        })
      }

      const dupe = await tx.message.findFirst({
        where: { conversationId: conversation.id, externalMessageId },
        select: { id: true },
      })
      if (dupe) return [] as string[]

      const message = await tx.message.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          externalMessageId,
          direction,
          text,
          sentAt: input.sentAt,
          deliveryStatus: direction === "IN" ? "DELIVERED" : "SENT",
          ...(messageMetadata
            ? { metadata: messageMetadata as unknown as Prisma.InputJsonValue }
            : {}),
        },
      })

      if (direction === "OUT") {
        // The seller answered via OLX UI / mobile app / another tool — from the
        // inbox's perspective, the buyer is no longer waiting on a reply. Clear
        // needsReply alongside bumping lastSellerReplyAt, and fan out a
        // conversation.updated so any web client viewing the list refreshes the
        // badge without waiting for the next full conversation refetch.
        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            needsReply: false,
            lastSellerReplyAt: input.sentAt,
            lastActivityAt: input.sentAt,
            buyerDisplayName: buyerName,
          },
        })
        const occurredAt = input.sentAt.toISOString()
        const outboxConv = await tx.outboxEvent.create({
          data: {
            workspaceId: input.workspaceId,
            type: "conversation.updated",
            aggregateId: conversation.id,
            payload: {
              schemaVersion: 1,
              workspaceId: input.workspaceId,
              occurredAt,
              data: {
                conversationId: conversation.id,
                patch: {
                  needsReply: false,
                  lastActivityAt: occurredAt,
                },
              },
            },
            status: "PENDING",
            nextAttemptAt: input.sentAt,
          },
        })
        return [outboxConv.id]
      }

      const next = applyIncomingMessageEffects(
        {
          id: conversation.id,
          needsReply: conversation.needsReply,
          isArchived: conversation.isArchived,
          isPinnedInAll: conversation.isPinnedInAll,
          snoozedUntil: conversation.snoozedUntil ? conversation.snoozedUntil.toISOString() : null,
          tagIds: [],
        },
        { direction: "IN" },
        input.sentAt,
      )

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          needsReply: next.needsReply,
          isArchived: next.isArchived,
          archivedAt: null,
          isPinnedInAll: next.isPinnedInAll,
          pinnedAt: null,
          lastIncomingAt: input.sentAt,
          lastActivityAt: input.sentAt,
          buyerDisplayName: buyerName,
        },
      })

      const occurredAt = input.sentAt.toISOString()
      const messageDto = {
        id: message.id,
        conversationId: message.conversationId,
        direction: message.direction,
        text: message.text,
        clientMessageId: message.clientMessageId ?? null,
        createdAt: message.createdAt.toISOString(),
        sentAt: message.sentAt ? message.sentAt.toISOString() : null,
        deliveryStatus: message.deliveryStatus,
        errorCode: message.errorCode ?? null,
        errorMessage: message.errorMessage ?? null,
        metadata: messageMetadata,
      }

      const outboxMessage = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "message.new",
          aggregateId: message.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt,
            data: { conversationId: conversation.id, message: messageDto },
          },
          status: "PENDING",
          nextAttemptAt: input.sentAt,
        },
      })
      const outboxConv = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "conversation.updated",
          aggregateId: conversation.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt,
            data: {
              conversationId: conversation.id,
              patch: {
                needsReply: next.needsReply,
                isArchived: next.isArchived,
                isPinnedInAll: next.isPinnedInAll,
                lastIncomingAt: occurredAt,
                lastActivityAt: occurredAt,
              },
            },
          },
          status: "PENDING",
          nextAttemptAt: input.sentAt,
        },
      })
      return [outboxMessage.id, outboxConv.id]
    })

    for (const outboxEventId of outboxIds) {
      try {
        await this.outboxQueue.add(
          "process",
          { outboxEventId },
          { removeOnComplete: true, removeOnFail: true },
        )
      } catch (err) {
        this.logger.warn({ outboxEventId, err }, "channelSync.olx: failed to enqueue outbox event")
      }
    }
  }
}
