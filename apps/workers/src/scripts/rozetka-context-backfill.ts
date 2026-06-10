/**
 * One-shot context backfill for Rozetka conversations — DO NOT KEEP IN MAIN.
 *
 * Companion to the OLX context backfill. Walks every enabled Rozetka
 * channel account, fetches the recent /orders/search window with
 * `expand=purchases,items_photos`, and for each Conversation whose
 * contextType IS NULL writes the product card fields the inbox UI
 * already renders (PR #72 wired the ChatContextCard component).
 *
 * Run via DigitalOcean App Platform → omnichat-prod → workers → Console:
 *
 *   node dist/scripts/rozetka-context-backfill.js | tee /tmp/rzctx.jsonl
 *
 * Idempotent: only updates rows where contextType IS NULL. Skips
 * conversations whose externalConversationId doesn't match any order
 * the listing returned (out-of-window or deleted on Rozetka side).
 * Deleted in the next cleanup PR.
 */
import { PrismaClient } from "@omnichat/db"
import { DekManager, EnvelopeCryptoService } from "@omnichat/kms"
import { InfisicalKmsClient } from "@omnichat/kms/infisical"

const ROZETKA_BASE_URL = String(
  process.env.ROZETKA_API_BASE_URL ?? "https://api-seller.rozetka.com.ua",
).trim()
const REQUEST_TIMEOUT_MS = Number(process.env.ROZETKA_REQUEST_TIMEOUT_MS ?? 15_000)
const ROZETKA_ADMIN_ORDER_URL = "https://seller.rozetka.com.ua/main/orders/edit"
// First backfill run hit `totalSkippedNoOrder: 1` — the conversation's
// order was older than 90 days. Widen to a full year so backlog from
// long-running chats gets covered. The worker's live polling still uses
// the 30-day window — this script is a one-shot history pass.
const CHANGED_FROM_DAYS = 365

type RozetkaAuthData = { apiToken: string; apiBaseUrl?: string }
type RozetkaPurchase = { item_name?: string; quantity?: number }
type RozetkaItemPhoto = {
  id?: number
  url?: string
  item_name?: string
  item_url?: string
  item_price?: string
}
type RozetkaOrder = {
  id: number
  purchases?: RozetkaPurchase[]
  items_photos?: RozetkaItemPhoto[]
}
type RozetkaOrdersResponse = {
  success?: boolean
  content?: { orders?: RozetkaOrder[] }
}

function emit(rec: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(rec)}\n`)
}

function isHttpUrl(value: string | null | undefined): value is string {
  if (typeof value !== "string" || value.length === 0) return false
  try {
    const u = new URL(value)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function firstItemPhoto(order: RozetkaOrder): RozetkaItemPhoto | null {
  for (const p of order.items_photos ?? []) {
    if (p?.url) return p
  }
  return null
}

function orderToContext(order: RozetkaOrder): {
  contextType: "ORDER"
  contextTitle: string | null
  contextPrice: number | null
  contextCurrency: string | null
  contextThumbUrl: string | null
  contextExternalUrl: string | null
  contextExternalId: string
} | null {
  const photo = firstItemPhoto(order)
  const firstPurchase = (order.purchases ?? [])[0] ?? null
  const title = photo?.item_name?.trim() ?? firstPurchase?.item_name?.trim() ?? null
  const priceRaw = typeof photo?.item_price === "string" ? Number(photo.item_price) : NaN
  const priceValue = Number.isFinite(priceRaw) ? Math.round(priceRaw) : null
  const orderAdminUrl = `${ROZETKA_ADMIN_ORDER_URL}/${order.id}`
  const contextExternalUrl = isHttpUrl(photo?.item_url ?? null) ? photo!.item_url! : orderAdminUrl
  if (!title && !photo?.url && (order.purchases?.length ?? 0) === 0) return null
  return {
    contextType: "ORDER",
    contextTitle: title,
    contextPrice: priceValue,
    contextCurrency: "UAH",
    contextThumbUrl: isHttpUrl(photo?.url ?? null) ? photo!.url! : null,
    contextExternalUrl,
    contextExternalId: String(order.id),
  }
}

async function fetchOrders(
  baseUrl: string,
  apiToken: string,
): Promise<RozetkaOrder[]> {
  const changedFrom = new Date(Date.now() - CHANGED_FROM_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const url = new URL(`${baseUrl}/orders/search`)
  url.searchParams.set("page", "1")
  url.searchParams.set("sort", "-changed")
  url.searchParams.set("changed_from", changedFrom)
  url.searchParams.set("types", "1")
  url.searchParams.set("expand", "purchases,items_photos")
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      emit({ kind: "fetch_error", url: url.toString(), status: res.status })
      return []
    }
    const body = (await res.json()) as RozetkaOrdersResponse
    if (body.success === false) {
      emit({ kind: "fetch_error", url: url.toString(), reason: "success=false" })
      return []
    }
    return body.content?.orders ?? []
  } catch (err) {
    emit({ kind: "fetch_throw", error: err instanceof Error ? err.message : String(err) })
    return []
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
    where: { channel: "ROZETKA", isEnabled: true, authDataEncrypted: { not: null } },
    select: { id: true, workspaceId: true, externalAccountId: true, authDataEncrypted: true },
    orderBy: [{ id: "asc" }],
  })
  emit({ kind: "begin", accountCount: accounts.length })

  let totalConvsScanned = 0
  let totalFilled = 0
  let totalSkippedNoOrder = 0
  let totalSkippedNoContext = 0
  let totalSkippedAlreadyFilled = 0

  for (const acc of accounts) {
    emit({ kind: "account_begin", channelAccountId: acc.id })
    let apiToken: string
    let baseUrl = ROZETKA_BASE_URL
    try {
      const auth = (await crypto.decrypt(acc.workspaceId, String(acc.authDataEncrypted))) as RozetkaAuthData
      if (!auth.apiToken) {
        emit({ kind: "account_skip_no_token", channelAccountId: acc.id })
        continue
      }
      apiToken = auth.apiToken
      if (auth.apiBaseUrl) baseUrl = auth.apiBaseUrl
    } catch (err) {
      emit({
        kind: "account_decrypt_failed",
        channelAccountId: acc.id,
        error: err instanceof Error ? err.message : String(err),
      })
      continue
    }

    const orders = await fetchOrders(baseUrl, apiToken)
    const orderById = new Map<string, RozetkaOrder>()
    for (const o of orders) orderById.set(String(o.id), o)
    emit({ kind: "account_orders_fetched", channelAccountId: acc.id, orderCount: orders.length })

    const convs = await prisma.conversation.findMany({
      where: {
        channelAccountId: acc.id,
        contextType: null,
        externalConversationId: { not: null },
      },
      select: { id: true, externalConversationId: true },
    })
    emit({
      kind: "account_convs_with_null_context",
      channelAccountId: acc.id,
      count: convs.length,
    })

    for (const conv of convs) {
      totalConvsScanned += 1
      let order = orderById.get(String(conv.externalConversationId))
      if (!order) {
        // Fall back to GET /orders/{id} — covers orders outside the
        // listing window OR in a status_group the listing filter
        // excludes (status_group=2/3 or types other than 1). Mirrors
        // OLX's fetchThread fallback when the listing trims data.
        const url = new URL(`${baseUrl}/orders/${conv.externalConversationId}`)
        url.searchParams.set("expand", "purchases,items_photos")
        try {
          const res = await fetch(url.toString(), {
            method: "GET",
            headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          })
          if (res.ok) {
            const body = (await res.json()) as { success?: boolean; content?: RozetkaOrder | null }
            if (body.success !== false && body.content) {
              order = body.content
              emit({ kind: "fetched_by_id", externalConversationId: conv.externalConversationId })
            }
          }
        } catch {
          // fall through to noOrder skip
        }
      }
      if (!order) {
        totalSkippedNoOrder += 1
        continue
      }
      const ctx = orderToContext(order)
      if (!ctx) {
        totalSkippedNoContext += 1
        continue
      }
      const upd = await prisma.conversation.updateMany({
        where: { id: conv.id, contextType: null },
        data: ctx,
      })
      if (upd.count > 0) {
        totalFilled += 1
        emit({
          kind: "filled",
          channelAccountId: acc.id,
          conversationId: conv.id,
          externalConversationId: conv.externalConversationId,
          orderId: ctx.contextExternalId,
          title: ctx.contextTitle,
          priceValue: ctx.contextPrice,
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
    totalSkippedNoOrder,
    totalSkippedNoContext,
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
