/**
 * One-shot context backfill — DO NOT KEEP IN MAIN.
 *
 * Earlier OLX worker code never wrote `Conversation.context*` fields
 * (the column existed from the Rozetka work but no channel populated it).
 * From this PR forward new OLX conversations get context inline + existing
 * ones get lazy-filled on next message. This script bulk-fills everything
 * already-quiet so the inbox shows product cards immediately.
 *
 * Flow per OLX channel account:
 *   1. Decrypt OAuth token via Infisical KMS.
 *   2. Page through GET /api/partner/threads to collect {threadId, advertId}.
 *   3. For each conversation whose contextType IS NULL:
 *        - GET /api/partner/adverts/{advertId} to fetch title/image/price/url
 *        - UPDATE conversation SET contextType, contextTitle, etc. (idempotent)
 *   4. Skip 404 (advert deleted), 403 (no access), missing advertId.
 *
 * Run via DigitalOcean App Platform → omnichat-prod → workers → Console:
 *
 *   node dist/scripts/olx-context-backfill.js | tee /tmp/ctx.jsonl
 *
 * Deleted in the next cleanup PR.
 */
import { PrismaClient } from "@omnichat/db"
import { DekManager, EnvelopeCryptoService } from "@omnichat/kms"
import { InfisicalKmsClient } from "@omnichat/kms/infisical"

const OLX_BASE_URL = String(process.env.OLX_BASE_URL ?? "https://www.olx.ua").trim()
const OLX_THREADS_PATH = "/api/partner/threads"
const REQUEST_TIMEOUT_MS = Number(process.env.OLX_REQUEST_TIMEOUT_MS ?? 15_000)
const LIMIT_THREADS_PER_PAGE = 100
const MAX_THREAD_PAGES = 20

type OlxAuthData = {
  accessToken?: string
  refreshToken?: string
  apiToken?: string
}

// OLX UA Partner v2 spec: foreign keys are flat snake_case (`advert_id`),
// not nested objects. First backfill run silently skipped 62/62 because it
// looked at `thread.advert?.id` which doesn't exist in the response.
type OlxThread = {
  id: number | string
  advert_id?: number | string | null
  advert?: { id?: number | string | null } | null
}

function readAdvertId(t: OlxThread | { advert_id?: number | string | null; advert?: { id?: number | string | null } | null } | null | undefined): string | null {
  if (!t) return null
  if (t.advert_id != null) return String(t.advert_id)
  if (t.advert?.id != null) return String(t.advert.id)
  return null
}

type OlxAdvertResponse = {
  data?: {
    id?: number | string
    title?: string | null
    url?: string | null
    images?: Array<{ url?: string | null }> | null
    price?: { value?: number | string | null; currency?: string | null } | null
  } | null
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

async function fetchJson<T>(
  url: string,
  accessToken: string,
): Promise<{ ok: boolean; status: number; body: T | null }> {
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
      return { ok: false, status: res.status, body: null as T | null }
    }
    const body = (await res.json()) as T
    return { ok: true, status: res.status, body }
  } catch (err) {
    emit({ kind: "fetch_throw", url, error: err instanceof Error ? err.message : String(err) })
    return { ok: false, status: 0, body: null }
  }
}

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
    const r: { ok: boolean; status: number; body: { data?: OlxThread[]; links?: { next?: string | null } } | null } =
      await fetchJson<{ data?: OlxThread[]; links?: { next?: string | null } }>(nextUrl, accessToken)
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

function shapeAdvert(body: OlxAdvertResponse): {
  title: string | null
  imageUrl: string | null
  priceValue: number | null
  currency: string | null
  advertUrl: string | null
} | null {
  const data = body.data ?? null
  if (!data) return null
  const firstImage = Array.isArray(data.images)
    ? data.images.find((i) => typeof i?.url === "string" && i.url.trim().length > 0)?.url ?? null
    : null
  const advertUrl = typeof data.url === "string" && data.url.trim().length > 0 ? data.url.trim() : null

  let priceValue: number | null = null
  let currency: string | null = null
  if (data.price) {
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
  }

  return {
    title: typeof data.title === "string" && data.title.trim().length > 0 ? data.title.trim() : null,
    imageUrl: firstImage && isHttpUrl(firstImage) ? firstImage : null,
    priceValue,
    currency,
    advertUrl: advertUrl && isHttpUrl(advertUrl) ? advertUrl : null,
  }
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

  let totalConvsScanned = 0
  let totalSkippedAlreadyFilled = 0
  let totalSkippedNoAdvert = 0
  let totalSkippedAdvertFetchFailed = 0
  let totalFilled = 0

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
      emit({
        kind: "account_decrypt_failed",
        channelAccountId: acc.id,
        error: err instanceof Error ? err.message : String(err),
      })
      continue
    }

    const threads = await fetchAllThreads(accessToken)
    emit({ kind: "account_threads_fetched", channelAccountId: acc.id, threadCount: threads.length })

    // Seed the threadId→advertId map with whatever the listing returned.
    // In production OLX trims `advert` from the listing payload (verified:
    // first backfill run hit 0/62), so this map is usually empty and we fall
    // back to per-thread GET below for each conversation. Kept as a fast
    // path in case OLX starts returning advert in the listing in future.
    const advertByThread = new Map<string, string>()
    for (const t of threads) {
      const advertId = readAdvertId(t)
      if (advertId) advertByThread.set(String(t.id), advertId)
    }
    emit({
      kind: "account_listing_advert_count",
      channelAccountId: acc.id,
      withAdvertInListing: advertByThread.size,
      totalListed: threads.length,
    })

    // Walk every conversation for this account where contextType IS NULL.
    const convs = await prisma.conversation.findMany({
      where: {
        channelAccountId: acc.id,
        contextType: null,
        externalConversationId: { not: null },
      },
      select: { id: true, externalConversationId: true },
    })
    emit({ kind: "account_convs_with_null_context", channelAccountId: acc.id, count: convs.length })

    // De-dup advert fetches across multiple conversations that pin to the
    // same listing (rare but possible — same buyer messaging from two threads).
    const advertCache = new Map<
      string,
      | { title: string | null; imageUrl: string | null; priceValue: number | null; currency: string | null; advertUrl: string | null }
      | null
    >()

    for (const conv of convs) {
      totalConvsScanned += 1
      const threadId = String(conv.externalConversationId)
      let advertId = advertByThread.get(threadId) ?? null
      if (!advertId) {
        // Listing trimmed advert — per-thread GET to recover it.
        const url = joinUrl(OLX_BASE_URL, `${OLX_THREADS_PATH}/${threadId}`)
        const r = await fetchJson<{
          data?: { advert_id?: number | string | null; advert?: { id?: number | string | null } | null } | null
        }>(url, accessToken)
        if (r.ok && r.body) {
          const fromBody = readAdvertId(r.body.data ?? null)
          if (fromBody) advertId = fromBody
        }
      }
      if (!advertId) {
        totalSkippedNoAdvert += 1
        continue
      }

      let shaped = advertCache.get(advertId)
      if (shaped === undefined) {
        const url = joinUrl(OLX_BASE_URL, `/api/partner/adverts/${advertId}`)
        const r = await fetchJson<OlxAdvertResponse>(url, accessToken)
        if (!r.ok || !r.body) {
          advertCache.set(advertId, null)
          emit({ kind: "advert_fetch_failed", channelAccountId: acc.id, advertId, status: r.status })
          shaped = null
        } else {
          shaped = shapeAdvert(r.body)
          advertCache.set(advertId, shaped)
        }
      }

      if (!shaped) {
        totalSkippedAdvertFetchFailed += 1
        continue
      }

      // Idempotency: only update rows whose contextType is still NULL — the
      // worker may have lazy-filled it between scan and write.
      const upd = await prisma.conversation.updateMany({
        where: { id: conv.id, contextType: null },
        data: {
          contextType: "LISTING",
          contextTitle: shaped.title,
          contextPrice: shaped.priceValue,
          contextCurrency: shaped.currency,
          contextThumbUrl: shaped.imageUrl,
          contextExternalUrl: shaped.advertUrl,
          contextExternalId: advertId,
        },
      })

      if (upd.count > 0) {
        totalFilled += 1
        emit({
          kind: "filled",
          channelAccountId: acc.id,
          conversationId: conv.id,
          externalConversationId: threadId,
          advertId,
          title: shaped.title,
          priceValue: shaped.priceValue,
          currency: shaped.currency,
        })
      } else {
        totalSkippedAlreadyFilled += 1
      }
    }

    emit({ kind: "account_done", channelAccountId: acc.id })
  }

  emit({
    kind: "summary",
    accountCount: accounts.length,
    totalConvsScanned,
    totalFilled,
    totalSkippedNoAdvert,
    totalSkippedAdvertFetchFailed,
    totalSkippedAlreadyFilled,
  })

  await prisma.$disconnect()
}

main().catch((err) => {
  emit({
    kind: "fatal",
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack?.slice(0, 800) : undefined,
  })
  process.exit(1)
})
