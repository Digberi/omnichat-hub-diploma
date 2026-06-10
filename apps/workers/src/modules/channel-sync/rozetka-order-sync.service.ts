import { InjectQueue } from "@nestjs/bullmq"
import { Inject, Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { Queue } from "bullmq"
import { PinoLogger } from "nestjs-pino"
import { Prisma } from "@omnichat/db"
import { ENVELOPE_CRYPTO } from "@omnichat/kms/nest"
import type { EnvelopeCryptoService } from "@omnichat/kms"

import { PrismaService } from "../prisma/prisma.service"

const ROZETKA_DEFAULT_BASE_URL = "https://api-seller.rozetka.com.ua"
const ROZETKA_DEFAULT_TIMEOUT_MS = 8_000
const ROZETKA_ADMIN_ORDER_URL = "https://seller.rozetka.com.ua/main/orders/edit"

type RozetkaAuthData = { apiToken: string; apiBaseUrl?: string }

type RozetkaPurchase = { item_name?: string; quantity?: number }
type RozetkaItemPhoto = { id?: number; url?: string; item_name?: string; item_url?: string; item_price?: string }
type RozetkaUserTitle = { full_name?: string | null; first_name?: string | null; last_name?: string | null }

type RozetkaOrder = {
  id: number
  status: number | string
  amount?: number | string | null
  cost_with_discount?: number | string | null
  created: string
  changed?: string
  user_title?: RozetkaUserTitle | null
  user_phone?: string | null
  purchases?: RozetkaPurchase[]
  items_photos?: RozetkaItemPhoto[]
}

type RozetkaOrdersResponse = {
  success?: boolean
  content?: { orders?: RozetkaOrder[] }
}

type RozetkaOrderStatus = {
  id: number
  name?: string | null
  name_uk?: string | null
  name_en?: string | null
}

type RozetkaStatusesResponse = {
  success?: boolean
  content?: { orderStatus?: RozetkaOrderStatus[] }
}

type StatusMap = Map<string, string>

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function parseRozetkaTimestamp(value: string | null | undefined): Date | null {
  if (!value || typeof value !== "string") return null
  // Rozetka returns "YYYY-MM-DD HH:MM:SS" naive (UA local). Resolve the real
  // Europe/Kyiv offset for the given instant via Intl so DST is correct.
  // Same parser as rozetka-channel-sync.service.ts; keep them in sync.
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, ys, mos, ds, hs, mis, ss] = m as unknown as [string, string, string, string, string, string, string]
  const y = Number(ys),
    mo = Number(mos),
    d = Number(ds),
    h = Number(hs),
    mi = Number(mis),
    s = Number(ss)
  const probe = Date.UTC(y, mo - 1, d, h, mi, s)
  if (!Number.isFinite(probe)) return null
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  const parts = fmt.formatToParts(new Date(probe))
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? "0")
  const kyivAsIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  const offsetMs = kyivAsIfUtc - probe
  return new Date(probe - offsetMs)
}

// Inbox + push notifications render Message.text as plain text
// (apps/web/.../MessageBubble.tsx wraps it in <p>{message.text}</p> with
// whitespace-pre-wrap; mobile push sends the raw string verbatim). We
// previously emitted HTML and operators saw literal "<p>" / "<img>" / "<a>"
// tags in their inbox. Stick with newline-separated plain text — the inbox
// already auto-linkifies URLs into a separate link-preview card.
function formatItems(order: RozetkaOrder): string {
  const items = order.purchases ?? []
  if (items.length === 0) return "—"
  return items
    .map((p) => `${(p.item_name ?? "—").trim()} ×${p.quantity ?? 0}`)
    .join(", ")
}

function firstItemPhoto(order: RozetkaOrder): RozetkaItemPhoto | null {
  for (const p of order.items_photos ?? []) {
    if (p?.url) return p
  }
  return null
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

/**
 * Map a Rozetka order to the Conversation.context* shape. Picks the first
 * item with a photo as the "primary product" of the order — multi-item
 * orders show that product's image/title/price; the buyer can still see
 * the full purchase list inside the order-card message bubble. Mirrors
 * OLX's single-product pinned card UX. Returns null when there's nothing
 * worth pinning (no item photos AND no purchases at all).
 */
function orderToConversationContext(
  order: RozetkaOrder,
  statusMap: StatusMap | null,
): {
  contextType: "ORDER"
  contextTitle: string | null
  contextPrice: number | null
  contextCurrency: string | null
  contextThumbUrl: string | null
  contextExternalUrl: string | null
  contextExternalId: string
  contextStatusId: string | null
  contextStatusName: string | null
} | null {
  const photo = firstItemPhoto(order)
  const firstPurchase = (order.purchases ?? [])[0] ?? null
  const title =
    photo?.item_name?.trim() ?? firstPurchase?.item_name?.trim() ?? null
  const priceRaw =
    typeof photo?.item_price === "string" ? Number(photo.item_price) : NaN
  const priceValue = Number.isFinite(priceRaw) ? Math.round(priceRaw) : null
  const itemUrl = photo?.item_url ?? null
  const orderAdminUrl = `${ROZETKA_ADMIN_ORDER_URL}/${order.id}`
  // Prefer the item page URL when present (deep-links to the product
  // catalog); fall back to the order edit URL.
  const contextExternalUrl = isHttpUrl(itemUrl) ? itemUrl : orderAdminUrl
  if (!title && !photo?.url && (order.purchases?.length ?? 0) === 0) return null
  const statusStr = String(order.status)
  const statusName = resolveStatusName(statusStr, statusMap)
  return {
    contextType: "ORDER",
    contextTitle: title,
    contextPrice: priceValue,
    contextCurrency: "UAH",
    contextThumbUrl: isHttpUrl(photo?.url ?? null) ? photo!.url! : null,
    contextExternalUrl,
    contextExternalId: String(order.id),
    contextStatusId: statusStr,
    contextStatusName: statusName,
  }
}

function buyerDisplayName(order: RozetkaOrder): string {
  const full = order.user_title?.full_name?.trim()
  if (full) return full
  const first = order.user_title?.first_name?.trim() ?? ""
  const last = order.user_title?.last_name?.trim() ?? ""
  const composed = `${first} ${last}`.trim()
  if (composed) return composed
  return `Покупець Розетки #${order.id}`
}

// Canonical Rozetka order status names per the official Marketplace API
// PDF §9.1 (Order statuses table). Source:
//   https://public.rozetka.market/sellerrozetka/s1596/API%20ROZETKA%20eng.pdf
//
// The previous hardcoded map was DANGEROUSLY WRONG for several ids:
//   - id 29 was labeled "Оплачено" but Rozetka actually returns it for
//     "Скасування. Невірна ціна на сайті" — i.e. a CANCELLATION.
//   - id 44 was labeled "Скомплектовано" but Rozetka returns it for
//     "Скасування. Фейкове замовлення".
//   - ids 23, 55, 61, 63, 70, 75, 78, 80, 87, 88 are not in §9.1 at all —
//     they appear to be invented (or from an older/different table) and
//     have been removed.
//
// `statusGroup` is the second-level bucket: 1 = Processing,
// 2 = Successfully completed, 3 = Unsuccessfully completed (cancelled).
// Used by the inbox to colour-code the chip (TODO: surface to UI).
//
// The live `/order-statuses/search` map still wins when present — this
// fallback only kicks in when the endpoint fails or returns nothing for
// a given id. Marketplaces sometimes return account-scoped custom ids
// outside 1–50; those will fall through to the bare numeric label.
export type RozetkaStatusInfo = {
  name: string
  statusGroup: 1 | 2 | 3
}
const ROZETKA_STATUS_FALLBACK: Readonly<Record<string, RozetkaStatusInfo>> = {
  // Processing (1) — order is moving forward.
  "1": { name: "Нове замовлення", statusGroup: 1 },
  "2": { name: "Дані підтверджено. Очікує відправлення", statusGroup: 1 },
  "3": { name: "Передано службі доставки", statusGroup: 1 },
  "4": { name: "Доставляється", statusGroup: 1 },
  "5": { name: "Очікує в пункті самовивозу", statusGroup: 1 },
  "26": { name: "В обробці", statusGroup: 1 },
  "27": { name: "Потрібне доукомплектування", statusGroup: 1 },
  "46": { name: "Відновлено після дзвінка", statusGroup: 1 },
  "47": { name: "Обробка менеджером (не дозвонились 1й раз)", statusGroup: 1 },
  "48": { name: "Обробка менеджером (не дозвонились 2й раз)", statusGroup: 1 },
  // Successfully completed (2)
  "6": { name: "Посилку отримано", statusGroup: 2 },
  // Unsuccessfully completed / cancelled (3)
  "7": { name: "Не оброблено продавцем", statusGroup: 3 },
  "10": { name: "Відправлення відкладено", statusGroup: 3 },
  "11": { name: "Посилку не забрали", statusGroup: 3 },
  "12": { name: "Відмова від товару", statusGroup: 3 },
  "13": { name: "Скасовано адміністратором", statusGroup: 3 },
  "15": { name: "Невірна ТТН", statusGroup: 3 },
  "16": { name: "Немає в наявності/брак", statusGroup: 3 },
  "17": { name: "Скасування. Спосіб оплати не влаштовує", statusGroup: 3 },
  "18": { name: "Скасування. Не вдалось зв'язатись", statusGroup: 3 },
  "19": { name: "Повернення", statusGroup: 3 },
  "20": { name: "Скасування. Товар не влаштовує", statusGroup: 3 },
  "24": { name: "Скасування. Доставка не влаштовує", statusGroup: 3 },
  "25": { name: "Тестове замовлення", statusGroup: 3 },
  "28": { name: "Невірні контактні дані", statusGroup: 3 },
  "29": { name: "Скасування. Невірна ціна на сайті", statusGroup: 3 },
  "30": { name: "Бронь закінчилась", statusGroup: 3 },
  "31": { name: "Скасування. Замовлення відновлено", statusGroup: 3 },
  "32": { name: "Скасування. Розгрупування не влаштовує", statusGroup: 3 },
  "33": { name: "Скасування. Вартість доставки не влаштовує", statusGroup: 3 },
  "34": { name: "Скасування. Перевізник/спосіб доставки не влаштовує", statusGroup: 3 },
  "35": { name: "Скасування. Терміни доставки не влаштовують", statusGroup: 3 },
  "36": { name: "Скасування. Безготівка недоступна", statusGroup: 3 },
  "37": { name: "Скасування. Передоплата не влаштовує", statusGroup: 3 },
  "38": { name: "Скасування. Якість товару", statusGroup: 3 },
  "39": { name: "Скасування. Характеристики не підходять", statusGroup: 3 },
  "40": { name: "Скасування. Клієнт передумав", statusGroup: 3 },
  "41": { name: "Скасування. Купив на іншому сайті", statusGroup: 3 },
  "42": { name: "Немає в наявності", statusGroup: 3 },
  "43": { name: "Брак", statusGroup: 3 },
  "44": { name: "Скасування. Фейкове замовлення", statusGroup: 3 },
  "45": { name: "Скасовано покупцем", statusGroup: 3 },
  "49": { name: "Скасування. Дублікат", statusGroup: 3 },
  "50": { name: "Скасування. Не оплачено", statusGroup: 3 },
}

function statusLabel(statusStr: string, statusMap: StatusMap | null): string {
  const liveName = statusMap?.get(statusStr)
  const fallbackName = ROZETKA_STATUS_FALLBACK[statusStr]?.name
  const name = liveName ?? fallbackName
  return name ? `${name} (${statusStr})` : statusStr
}

function formatCreatedText(order: RozetkaOrder, statusMap: StatusMap | null): string {
  const link = `${ROZETKA_ADMIN_ORDER_URL}/${order.id}`
  const amount = String(order.cost_with_discount ?? order.amount ?? "—")
  const photo = firstItemPhoto(order)
  const lines = [
    `📦 Замовлення #${order.id} створено`,
    `Сума: ${amount} ₴`,
    `Статус: ${statusLabel(String(order.status), statusMap)}`,
    `Дата: ${order.created}`,
    `Товари: ${formatItems(order)}`,
    `Кількість позицій: ${order.purchases?.length ?? 0}`,
    `Адмінка: ${link}`,
  ]
  if (photo?.url) lines.push(`Фото: ${photo.url}`)
  return lines.join("\n")
}

function formatStatusChangeText(
  order: RozetkaOrder,
  from: string,
  to: string,
  statusMap: StatusMap | null,
): string {
  const link = `${ROZETKA_ADMIN_ORDER_URL}/${order.id}`
  return [
    `🔄 Замовлення #${order.id}: ${statusLabel(from, statusMap)} → ${statusLabel(to, statusMap)}`,
    `Адмінка: ${link}`,
  ].join("\n")
}

type RozetkaOrderCreatedMeta = {
  kind: "rozetka_order_created"
  schemaVersion: 1
  orderId: string
  amount: string
  status: { id: string; name: string | null }
  createdAt: string
  items: Array<{ name: string; quantity: number }>
  photoUrl: string | null
  adminUrl: string
}

type RozetkaOrderStatusChangedMeta = {
  kind: "rozetka_order_status_changed"
  schemaVersion: 1
  orderId: string
  from: { id: string; name: string | null }
  to: { id: string; name: string | null }
  adminUrl: string
}

function resolveStatusName(statusStr: string, statusMap: StatusMap | null): string | null {
  return statusMap?.get(statusStr) ?? ROZETKA_STATUS_FALLBACK[statusStr]?.name ?? null
}

function buildCreatedMeta(order: RozetkaOrder, statusMap: StatusMap | null): RozetkaOrderCreatedMeta {
  const orderIdStr = String(order.id)
  const statusStr = String(order.status)
  const photo = firstItemPhoto(order)
  return {
    kind: "rozetka_order_created",
    schemaVersion: 1,
    orderId: orderIdStr,
    amount: String(order.cost_with_discount ?? order.amount ?? ""),
    status: { id: statusStr, name: resolveStatusName(statusStr, statusMap) },
    createdAt: order.created,
    items: (order.purchases ?? []).map((p) => ({
      name: (p.item_name ?? "").trim(),
      quantity: typeof p.quantity === "number" ? p.quantity : 0,
    })),
    photoUrl: photo?.url ?? null,
    adminUrl: `${ROZETKA_ADMIN_ORDER_URL}/${orderIdStr}`,
  }
}

function buildStatusChangedMeta(
  order: RozetkaOrder,
  fromId: string,
  toId: string,
  statusMap: StatusMap | null,
): RozetkaOrderStatusChangedMeta {
  const orderIdStr = String(order.id)
  return {
    kind: "rozetka_order_status_changed",
    schemaVersion: 1,
    orderId: orderIdStr,
    from: { id: fromId, name: resolveStatusName(fromId, statusMap) },
    to: { id: toId, name: resolveStatusName(toId, statusMap) },
    adminUrl: `${ROZETKA_ADMIN_ORDER_URL}/${orderIdStr}`,
  }
}

@Injectable()
export class RozetkaOrderSyncService {
  private fetchFn: typeof globalThis.fetch = globalThis.fetch.bind(globalThis)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCryptoService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @InjectQueue("outbox.process") private readonly outboxQueue: Queue,
  ) {
    this.logger.setContext(RozetkaOrderSyncService.name)
  }

  /** Test seam — replace the HTTP client. Not for production use. */
  setFetch(fn: typeof globalThis.fetch): void {
    this.fetchFn = fn
  }

  async runTick(): Promise<void> {
    const max = Number(this.config.get<number>("CHANNEL_SYNC_ROZETKA_MAX_ACCOUNTS") ?? 50)
    const accounts = await this.prisma.channelAccount.findMany({
      where: {
        channel: "ROZETKA",
        authType: "TOKEN",
        isEnabled: true,
        authDataEncrypted: { not: null },
      },
      select: {
        id: true,
        workspaceId: true,
        externalAccountId: true,
        authDataEncrypted: true,
      },
      orderBy: [{ lastSyncAt: "asc" }, { id: "asc" }],
      take: max,
    })

    if (accounts.length === 0) return

    const limit = Number(this.config.get<number>("CHANNEL_SYNC_ROZETKA_ORDERS_LIMIT") ?? 50)
    const timeoutMs = Number(this.config.get<number>("ROZETKA_REQUEST_TIMEOUT_MS") ?? ROZETKA_DEFAULT_TIMEOUT_MS)

    for (const account of accounts) {
      try {
        const auth = (await this.crypto.decrypt(
          account.workspaceId,
          String(account.authDataEncrypted),
        )) as RozetkaAuthData
        const baseUrl = (auth.apiBaseUrl ?? ROZETKA_DEFAULT_BASE_URL).replace(/\/$/, "")
        const orders = await this.fetchOrders({
          baseUrl,
          apiToken: auth.apiToken,
          limit,
          timeoutMs,
        })
        // Diagnostic: surface what the fetch returned so we can tell apart
        // "Rozetka returned no orders" from "Rozetka returned them but we
        // skipped them" when an expected status change doesn't appear.
        this.logger.info(
          {
            channelAccountId: account.id,
            orderCount: orders.length,
            // Flatten as string so it surfaces as a Loki structured-metadata
            // label (Loki drops nested arrays/objects but keeps scalar strings).
            sampleIds: orders
              .slice(0, 10)
              .map((o) => `${o.id}:${o.status}`)
              .join(","),
          },
          "rozetka /orders/search returned",
        )
        let statusMap: StatusMap | null = null
        if (orders.length > 0) {
          statusMap = await this.fetchStatusMap({
            baseUrl,
            apiToken: auth.apiToken,
            timeoutMs,
          }).catch((err) => {
            this.logger.warn(
              { channelAccountId: account.id, err: errorMessage(err).slice(0, 200) },
              "rozetka order statuses fetch failed; falling back to numeric codes",
            )
            return null
          })
          // Surface info-level fact about whether we got a usable map. Without
          // this we couldn't tell apart "API succeeded but returned empty" from
          // "we never even called it" — both end up as numeric labels in prod.
          this.logger.info(
            {
              channelAccountId: account.id,
              statusMapSize: statusMap ? statusMap.size : -1,
              sampleKeys: statusMap ? Array.from(statusMap.keys()).slice(0, 5) : [],
            },
            "rozetka order statuses map resolved",
          )
        }
        for (const order of orders) {
          try {
            await this.upsertOrderEvents({
              workspaceId: account.workspaceId,
              channelAccountId: account.id,
              order,
              statusMap,
            })
          } catch (err) {
            this.logger.warn(
              { channelAccountId: account.id, orderId: order.id, err: errorMessage(err).slice(0, 500) },
              "rozetka order persist failed",
            )
          }
        }
        await this.prisma.channelAccount.update({
          where: { id: account.id },
          data: { lastSyncAt: new Date(), lastError: null },
        })
      } catch (err) {
        const lastError = errorMessage(err).slice(0, 500)
        this.logger.warn(
          { channelAccountId: account.id, err: lastError },
          "Rozetka order tick failed for account",
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

  private async fetchOrders(input: {
    baseUrl: string
    apiToken: string
    limit: number
    timeoutMs: number
  }): Promise<RozetkaOrder[]> {
    // Sort by -changed and filter by changed_from = today-30 (Rozetka API uses YYYY-MM-DD,
    // no finer granularity). 30 days surfaces older status transitions — including late
    // cancellations on long-pending orders — that a 24h window silently dropped. Worker
    // is idempotent (Message.externalMessageId unique constraint), so re-seeing already-
    // ingested orders is safe.
    const changedFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const url = new URL(`${input.baseUrl}/orders/search`)
    url.searchParams.set("page", "1")
    url.searchParams.set("sort", "-changed")
    url.searchParams.set("changed_from", changedFrom)
    // types=1 means "all orders" in the alternative grouping (per Rozetka API docs
    // 8.2). Without it the endpoint silently defaults to the singular type=1
    // ("Processing") which excludes status_group=3 (Unsuccessful), so cancelled
    // orders never reach the inbox even when they were modified in the window.
    url.searchParams.set("types", "1")
    url.searchParams.set("expand", "purchases,user_title,items_photos")
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.apiToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(input.timeoutMs),
    })
    if (!res.ok) {
      throw new Error(`Rozetka /orders/search returned HTTP ${res.status}`)
    }
    const body = (await res.json()) as RozetkaOrdersResponse
    // Rozetka can report application-level failures via 200 + {"success":false}.
    // Treat that as a hard error so lastError surfaces instead of silently
    // sliding to 0 orders.
    if (body.success === false) {
      throw new Error("Rozetka /orders/search returned success=false")
    }
    const orders = body.content?.orders ?? []
    if (orders.length > input.limit) return orders.slice(0, input.limit)
    return orders
  }

  private async fetchStatusMap(input: {
    baseUrl: string
    apiToken: string
    timeoutMs: number
  }): Promise<StatusMap> {
    const url = new URL(`${input.baseUrl}/order-statuses/search`)
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.apiToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(input.timeoutMs),
    })
    if (!res.ok) throw new Error(`Rozetka /order-statuses/search HTTP ${res.status}`)
    const body = (await res.json()) as RozetkaStatusesResponse
    if (body.success === false) throw new Error("Rozetka /order-statuses/search returned success=false")
    const list = body.content?.orderStatus ?? []
    const map: StatusMap = new Map()
    for (const s of list) {
      if (s.id == null) continue
      const name = s.name_uk ?? s.name ?? s.name_en
      if (name) map.set(String(s.id), name)
    }
    return map
  }

  private async upsertOrderEvents(input: {
    workspaceId: string
    channelAccountId: string
    order: RozetkaOrder
    statusMap: StatusMap | null
  }): Promise<void> {
    const orderIdStr = String(input.order.id)
    const statusStr = String(input.order.status)
    const buyerName = buyerDisplayName(input.order)
    const buyerPhone = input.order.user_phone ?? null
    const externalBuyerId = buyerPhone ?? orderIdStr // Rozetka order schema doesn't expose user_id; use phone or fallback to order id

    // Pinned product card for the conversation. Built from the order we're
    // about to process — no extra fetch. Wired into create (inline) AND
    // lazy-fill on existing conversations whose contextType is still NULL
    // (i.e. created before this PR). Matches the OLX pattern shipped in
    // PR #72/#74 (which uses contextType=LISTING; Rozetka uses ORDER).
    const contextFields = orderToConversationContext(input.order, input.statusMap)

    const outboxIds = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let conversation = await tx.conversation.findFirst({
        where: {
          workspaceId: input.workspaceId,
          channelAccountId: input.channelAccountId,
          externalConversationId: orderIdStr,
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
            channel: "ROZETKA",
            externalConversationId: orderIdStr,
            externalBuyerId,
            buyerDisplayName: buyerName,
            buyerPhone,
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
        await tx.conversation.update({
          where: { id: conversation.id },
          data: contextFields,
        })
      }

      const prevState = await tx.rozetkaOrderState.findUnique({
        where: {
          channelAccountId_externalOrderId: {
            channelAccountId: input.channelAccountId,
            externalOrderId: orderIdStr,
          },
        },
      })

      const collectedOutbox: string[] = []
      // For "order created" events use the actual order creation timestamp (parsed from
      // Rozetka's "YYYY-MM-DD HH:MM:SS" Kyiv-local string). For status changes use now,
      // since the transition happened recently. Falls back to now if parse fails.
      const orderCreatedAt = parseRozetkaTimestamp(input.order.created) ?? new Date()
      const now = new Date()

      const emit = async (
        externalMessageId: string,
        text: string,
        eventOccurredAt: Date,
        metadata: RozetkaOrderCreatedMeta | RozetkaOrderStatusChangedMeta,
      ) => {
        const dupe = await tx.message.findFirst({
          where: { conversationId: conversation!.id, externalMessageId },
          select: { id: true },
        })
        if (dupe) return

        const message = await tx.message.create({
          data: {
            workspaceId: input.workspaceId,
            conversationId: conversation!.id,
            externalMessageId,
            direction: "IN",
            text,
            metadata: metadata as unknown as Prisma.InputJsonValue,
            sentAt: eventOccurredAt,
            deliveryStatus: "DELIVERED",
          },
        })

        // Refresh the Conversation's pinned context status so the chat
        // header chip and inbox-row pill display the *current* status
        // without the web having to walk Message.metadata. Every order
        // event (created OR status_changed) lands on the same row so
        // it stays in sync with Rozetka's view.
        const eventStatusName = resolveStatusName(statusStr, input.statusMap)

        // Order events are SYNTHETIC notifications, not buyer messages. The
        // operator can't "reply" to them — there's no chat thread on Rozetka
        // for an order status change. Treating them as incoming messages
        // (applyIncomingMessageEffects) sets needsReply=true forever and
        // un-archives the conversation, which doesn't match the UX. Bump
        // lastActivityAt/lastIncomingAt so the conversation rises to the top
        // of the inbox, but leave needsReply / isArchived as they were.
        await tx.conversation.update({
          where: { id: conversation!.id },
          data: {
            lastIncomingAt: eventOccurredAt,
            lastActivityAt: eventOccurredAt,
            buyerDisplayName: buyerName,
            contextStatusId: statusStr,
            contextStatusName: eventStatusName,
          },
        })

        const occurredAt = eventOccurredAt.toISOString()
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
          // Send the structured payload over the websocket too so the inbox
          // renders the card immediately, not only after a refetch.
          metadata,
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
              data: { conversationId: conversation!.id, message: messageDto },
            },
            status: "PENDING",
            nextAttemptAt: eventOccurredAt,
          },
        })
        const outboxConv = await tx.outboxEvent.create({
          data: {
            workspaceId: input.workspaceId,
            type: "conversation.updated",
            aggregateId: conversation!.id,
            payload: {
              schemaVersion: 1,
              workspaceId: input.workspaceId,
              occurredAt,
              data: {
                conversationId: conversation!.id,
                patch: {
                  // Order events bump activity but don't toggle reply/archive state.
                  lastIncomingAt: occurredAt,
                  lastActivityAt: occurredAt,
                  contextStatusId: statusStr,
                  contextStatusName: eventStatusName,
                },
              },
            },
            status: "PENDING",
            nextAttemptAt: eventOccurredAt,
          },
        })
        collectedOutbox.push(outboxMessage.id, outboxConv.id)
      }

      if (!prevState) {
        await emit(
          `order:${orderIdStr}:created`,
          formatCreatedText(input.order, input.statusMap),
          orderCreatedAt,
          buildCreatedMeta(input.order, input.statusMap),
        )
      } else if (prevState.lastSeenStatus !== statusStr) {
        const externalMessageId = `order:${orderIdStr}:status:${statusStr}:${now.getTime()}`
        await emit(
          externalMessageId,
          formatStatusChangeText(input.order, prevState.lastSeenStatus, statusStr, input.statusMap),
          now,
          buildStatusChangedMeta(input.order, prevState.lastSeenStatus, statusStr, input.statusMap),
        )
      }

      await tx.rozetkaOrderState.upsert({
        where: {
          channelAccountId_externalOrderId: {
            channelAccountId: input.channelAccountId,
            externalOrderId: orderIdStr,
          },
        },
        update: { lastSeenStatus: statusStr, lastSeenAt: now },
        create: {
          workspaceId: input.workspaceId,
          channelAccountId: input.channelAccountId,
          externalOrderId: orderIdStr,
          lastSeenStatus: statusStr,
          lastSeenAt: now,
        },
      })

      return collectedOutbox
    })

    for (const outboxEventId of outboxIds) {
      try {
        await this.outboxQueue.add(
          "process",
          { outboxEventId },
          { removeOnComplete: true, removeOnFail: true },
        )
      } catch (err) {
        this.logger.warn({ outboxEventId, err }, "channelSync.rozetka.orders: failed to enqueue outbox event")
      }
    }
  }
}
