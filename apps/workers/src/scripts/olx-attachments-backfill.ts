/**
 * One-shot attachments backfill — DO NOT KEEP IN MAIN.
 *
 * Companion to the direction backfill. Earlier OLX worker code dropped
 * `attachments[]` and `cvs[]` from incoming messages (PR #60 wired them in
 * for new messages, but old DB rows have neither URL nor placeholder text).
 * This script re-polls every enabled OLX channel account, fetches every
 * thread + every message, and for any DB row whose stored `metadata` is
 * still NULL but whose live OLX payload carries attachments, writes the
 * canonical `metadata.olx_message_attachments` structure plus a "📎 Фото"
 * style placeholder into `text` (so the inbox preview isn't blank).
 *
 * Skip conditions (idempotent):
 *   - Row already has metadata (delivery cards, attachments already saved,
 *     Rozetka orders, etc.) → leave alone.
 *   - OLX msg has no attachments → no-op.
 *   - URL fails the http(s) scheme check → no-op (same defence as the
 *     worker; rejects `javascript:` / `data:` / `file:`).
 *
 * Run via DigitalOcean App Platform → omnichat-prod → workers → Console:
 *
 *   node dist/scripts/olx-attachments-backfill.js | tee /tmp/attach.jsonl
 *
 * Output schema mirrors the direction backfill (one JSON record per line)
 * plus a final `{"kind":"summary",...}` with counts. Deleted in the next
 * cleanup PR.
 */
import { Prisma, PrismaClient } from "@omnichat/db"
import { DekManager, EnvelopeCryptoService } from "@omnichat/kms"
import { InfisicalKmsClient } from "@omnichat/kms/infisical"

const OLX_BASE_URL = String(process.env.OLX_BASE_URL ?? "https://www.olx.ua").trim()
const OLX_THREADS_PATH = "/api/partner/threads"
const REQUEST_TIMEOUT_MS = Number(process.env.OLX_REQUEST_TIMEOUT_MS ?? 15_000)
const LIMIT_THREADS_PER_PAGE = 100
const LIMIT_MESSAGES_PER_THREAD = 200
const MAX_THREAD_PAGES = 20

type OlxAuthData = {
  accessToken?: string
  refreshToken?: string
  apiToken?: string
}

type OlxAttachmentRef = { name?: string | null; url?: string | null }
type OlxThread = { id: number | string }
type OlxMessage = {
  id: number | string
  thread_id?: number | string
  type?: string | null
  text?: string | null
  created_at?: string
  attachments?: OlxAttachmentRef[] | null
  cvs?: OlxAttachmentRef[] | null
}

type OlxAttachmentItem = {
  name: string | null
  url: string
  kind: "attachment" | "cv"
}

function joinUrl(baseUrl: string, path: string): string {
  const a = baseUrl.replace(/\/+$/, "")
  const b = path.startsWith("/") ? path : `/${path}`
  return `${a}${b}`
}

function emit(rec: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(rec)}\n`)
}

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function collectAttachments(msg: OlxMessage): OlxAttachmentItem[] {
  const out: OlxAttachmentItem[] = []
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

function attachmentPreviewFallback(items: OlxAttachmentItem[]): string {
  // Same shape as the worker's `attachmentPreviewFallback`. Web bubble
  // strips this placeholder when metadata.olx_message_attachments is
  // present, to avoid double rendering above the inline image/file.
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

async function fetchJson<T>(url: string, accessToken: string): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        Version: "2.0",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      emit({ kind: "fetch_error", url, status: res.status, body: text.slice(0, 200) })
      return { ok: false, status: res.status, body: null }
    }
    const body = (await res.json()) as T
    return { ok: true, status: res.status, body }
  } catch (err) {
    emit({ kind: "fetch_throw", url, error: err instanceof Error ? err.message : String(err) })
    return { ok: false, status: 0, body: null }
  }
}

type OlxThreadsResponseBody = { data?: OlxThread[]; links?: { next?: string | null } }

async function fetchAllThreads(accessToken: string): Promise<OlxThread[]> {
  const collected: OlxThread[] = []
  const seen = new Set<string>()
  const startUrl = (() => {
    const u = new URL(joinUrl(OLX_BASE_URL, OLX_THREADS_PATH))
    u.searchParams.set("limit", String(LIMIT_THREADS_PER_PAGE))
    return u.toString()
  })()
  let nextUrl: string | null = startUrl
  let safety = 0
  while (nextUrl && safety < MAX_THREAD_PAGES) {
    safety += 1
    const r: { ok: boolean; status: number; body: OlxThreadsResponseBody | null } = await fetchJson<OlxThreadsResponseBody>(nextUrl, accessToken)
    if (!r.ok || !r.body) break
    for (const t of r.body.data ?? []) collected.push(t)
    const linksNext: string | null | undefined = r.body.links?.next
    const candidate: string | null = typeof linksNext === "string" ? linksNext.trim() : null
    if (!candidate || seen.has(candidate)) {
      nextUrl = null
    } else {
      seen.add(candidate)
      nextUrl = candidate
    }
  }
  return collected
}

async function fetchAllMessages(threadId: string, accessToken: string): Promise<OlxMessage[]> {
  const url = new URL(joinUrl(OLX_BASE_URL, `${OLX_THREADS_PATH}/${threadId}/messages`))
  url.searchParams.set("limit", String(LIMIT_MESSAGES_PER_THREAD))
  const r = await fetchJson<{ data?: OlxMessage[] }>(url.toString(), accessToken)
  if (!r.ok || !r.body) return []
  return r.body.data ?? []
}

async function main(): Promise<void> {
  const prisma = new PrismaClient()
  const kmsBaseUrl = String(process.env.INFISICAL_KMS_BASE_URL ?? "").trim()
  const kmsClientId = String(process.env.INFISICAL_CLIENT_ID ?? "").trim()
  const kmsClientSecret = String(process.env.INFISICAL_CLIENT_SECRET ?? "").trim()
  const kmsKekKeyId = String(process.env.INFISICAL_KMS_KEY_ID ?? "").trim()
  const missing: string[] = []
  if (!kmsBaseUrl) missing.push("INFISICAL_KMS_BASE_URL")
  if (!kmsClientId) missing.push("INFISICAL_CLIENT_ID")
  if (!kmsClientSecret) missing.push("INFISICAL_CLIENT_SECRET")
  if (!kmsKekKeyId) missing.push("INFISICAL_KMS_KEY_ID")
  if (missing.length > 0) {
    emit({ kind: "fatal", error: `Missing Infisical KMS env vars: ${missing.join(", ")}` })
    process.exit(1)
  }
  const kmsClient = new InfisicalKmsClient({
    baseUrl: kmsBaseUrl,
    clientId: kmsClientId,
    clientSecret: kmsClientSecret,
    kekKeyId: kmsKekKeyId,
  })
  const dekManager = new DekManager({ prisma, kmsClient })
  const crypto = new EnvelopeCryptoService({ dekManager })

  const accounts = await prisma.channelAccount.findMany({
    where: { channel: "OLX", isEnabled: true, authDataEncrypted: { not: null } },
    select: { id: true, workspaceId: true, externalAccountId: true, authDataEncrypted: true },
    orderBy: [{ id: "asc" }],
  })
  emit({ kind: "begin", accountCount: accounts.length })

  let totalScanned = 0
  let totalAttachmentsAdded = 0
  let totalTextPlaceholders = 0
  let totalSkippedAlreadyHadMetadata = 0

  for (const acc of accounts) {
    emit({ kind: "account_begin", channelAccountId: acc.id, externalAccountId: acc.externalAccountId })
    let accessToken: string
    try {
      const auth = (await crypto.decrypt(acc.workspaceId, String(acc.authDataEncrypted))) as OlxAuthData
      const tok = auth.accessToken ?? auth.apiToken ?? null
      if (!tok) {
        emit({ kind: "account_skip_no_token", channelAccountId: acc.id })
        continue
      }
      accessToken = tok
    } catch (err) {
      emit({ kind: "account_decrypt_failed", channelAccountId: acc.id, error: err instanceof Error ? err.message : String(err) })
      continue
    }

    const threads = await fetchAllThreads(accessToken)
    emit({ kind: "account_threads_fetched", channelAccountId: acc.id, threadCount: threads.length })

    for (const t of threads) {
      const threadIdStr = String(t.id)
      const conv = await prisma.conversation.findFirst({
        where: { channelAccountId: acc.id, externalConversationId: threadIdStr },
        select: { id: true },
      })
      if (!conv) continue

      const olxMsgs = await fetchAllMessages(threadIdStr, accessToken)
      const byExternalId = new Map<string, OlxMessage>()
      for (const m of olxMsgs) byExternalId.set(String(m.id), m)

      const dbMsgs = await prisma.message.findMany({
        where: { conversationId: conv.id },
        select: { id: true, externalMessageId: true, text: true, metadata: true },
      })

      for (const dbm of dbMsgs) {
        totalScanned += 1
        if (!dbm.externalMessageId) continue
        if (dbm.metadata != null) {
          totalSkippedAlreadyHadMetadata += 1
          continue
        }
        const olxm = byExternalId.get(dbm.externalMessageId)
        if (!olxm) continue
        const items = collectAttachments(olxm)
        if (items.length === 0) continue

        const metadata = {
          kind: "olx_message_attachments" as const,
          schemaVersion: 1 as const,
          items,
        }
        const oldText = dbm.text ?? ""
        const wantsPlaceholder = oldText.length === 0
        const placeholder = wantsPlaceholder ? attachmentPreviewFallback(items) : oldText

        // Idempotency: only touch rows whose metadata is still NULL (we
        // already filtered above but the WHERE here is a hard guard for the
        // very-rare write-after-read race).
        const upd = await prisma.message.updateMany({
          where: { id: dbm.id, metadata: { equals: Prisma.JsonNull } },
          data: {
            metadata: metadata as unknown as Prisma.InputJsonValue,
            ...(wantsPlaceholder ? { text: placeholder } : {}),
          },
        })

        if (upd.count > 0) {
          totalAttachmentsAdded += 1
          if (wantsPlaceholder) totalTextPlaceholders += 1
          emit({
            kind: "attached",
            channelAccountId: acc.id,
            conversationId: conv.id,
            externalConversationId: threadIdStr,
            messageId: dbm.id,
            externalMessageId: dbm.externalMessageId,
            itemCount: items.length,
            firstUrl: items[0]?.url ?? null,
            wantsPlaceholder,
            placeholderText: wantsPlaceholder ? placeholder : null,
          })
        }
      }
    }
    emit({ kind: "account_done", channelAccountId: acc.id })
  }

  emit({
    kind: "summary",
    accountCount: accounts.length,
    totalScanned,
    totalSkippedAlreadyHadMetadata,
    totalAttachmentsAdded,
    totalTextPlaceholders,
  })

  await prisma.$disconnect()
}

main().catch((err) => {
  emit({ kind: "fatal", error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack?.slice(0, 800) : undefined })
  process.exit(1)
})
