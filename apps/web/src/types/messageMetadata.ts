// Discriminated union + type guards for synthesized-message payloads.
// The inbox switches MessageBubble to a dedicated card when one of these
// matches; any unknown shape falls back to the default text bubble.

export type RozetkaOrderCreatedMeta = {
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

export type RozetkaOrderStatusChangedMeta = {
  kind: "rozetka_order_status_changed"
  schemaVersion: 1
  orderId: string
  from: { id: string; name: string | null }
  to: { id: string; name: string | null }
  adminUrl: string
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function isStatusRef(v: unknown): v is { id: string; name: string | null } {
  return isObject(v) && typeof v.id === "string" && (typeof v.name === "string" || v.name === null)
}

export function isRozetkaOrderCreatedMeta(meta: unknown): meta is RozetkaOrderCreatedMeta {
  if (!isObject(meta)) return false
  return (
    meta.kind === "rozetka_order_created" &&
    meta.schemaVersion === 1 &&
    typeof meta.orderId === "string" &&
    typeof meta.amount === "string" &&
    isStatusRef(meta.status) &&
    typeof meta.createdAt === "string" &&
    Array.isArray(meta.items) &&
    (typeof meta.photoUrl === "string" || meta.photoUrl === null) &&
    typeof meta.adminUrl === "string"
  )
}

export function isRozetkaOrderStatusChangedMeta(
  meta: unknown,
): meta is RozetkaOrderStatusChangedMeta {
  if (!isObject(meta)) return false
  return (
    meta.kind === "rozetka_order_status_changed" &&
    meta.schemaVersion === 1 &&
    typeof meta.orderId === "string" &&
    isStatusRef(meta.from) &&
    isStatusRef(meta.to) &&
    typeof meta.adminUrl === "string"
  )
}

export type OlxMessageAttachmentMeta = {
  kind: "olx_message_attachments"
  schemaVersion: 1
  items: Array<{
    name: string | null
    url: string
    kind: "attachment" | "cv"
  }>
}

// Reject `javascript:`, `data:`, `vbscript:` etc — bubble renders URL straight
// into anchor href / img src / video src, so anything other than http(s) is a
// potential XSS or exfiltration vector. https-only would also block the prod
// Mixed Content warning, but OLX historically serves images over http too; we
// allow http for now and let CSP/`Mixed Content` reporting catch what matters.
export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

export function isOlxMessageAttachmentMeta(
  meta: unknown,
): meta is OlxMessageAttachmentMeta {
  if (!isObject(meta)) return false
  if (meta.kind !== "olx_message_attachments" || meta.schemaVersion !== 1) return false
  if (!Array.isArray(meta.items) || meta.items.length === 0) return false
  return meta.items.every(
    (it) =>
      isObject(it) &&
      typeof it.url === "string" &&
      isHttpUrl(it.url) &&
      (typeof it.name === "string" || it.name === null) &&
      (it.kind === "attachment" || it.kind === "cv"),
  )
}

// OLX CDN serves attachments via hashed paths with no file extension
// (e.g. https://apollo-static.olxcdn.com/v1/files/abc123 — no `.jpg`).
// The `.jpg` only lives in the `name` field returned by the API. Match
// against either side so we render `<img>` for messages like
// `1000058733.jpg`.
const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|webp|bmp|avif)(\?|$)/i
const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|mkv)(\?|$)/i

export function isProbablyImageUrl(url: string, name?: string | null): boolean {
  if (IMAGE_EXT_RE.test(url)) return true
  if (typeof name === "string" && IMAGE_EXT_RE.test(name)) return true
  return false
}

export function isProbablyVideoUrl(url: string, name?: string | null): boolean {
  if (VIDEO_EXT_RE.test(url)) return true
  if (typeof name === "string" && VIDEO_EXT_RE.test(name)) return true
  return false
}

export type OlxDeliveryNoticeMeta = {
  kind: "olx_delivery_notice"
  schemaVersion: 1
  notice: string
  adminUrl: string
  // Optional product enrichment from /api/partner/adverts/{id}. Worker
  // adds it when the thread carries an advert id and the fetch succeeds;
  // older rows (before the enrichment shipped) carry undefined and fall
  // back to the bare card.
  advert?: {
    id: string
    title: string | null
    imageUrl: string | null
    priceText: string | null
    advertUrl: string | null
  } | null
}

function isOlxDeliveryAdvert(v: unknown): v is OlxDeliveryNoticeMeta["advert"] {
  if (v === null || v === undefined) return true
  if (!isObject(v)) return false
  return (
    typeof v.id === "string" &&
    (typeof v.title === "string" || v.title === null) &&
    (typeof v.imageUrl === "string" ? isHttpUrl(v.imageUrl) : v.imageUrl === null) &&
    (typeof v.priceText === "string" || v.priceText === null) &&
    (typeof v.advertUrl === "string" ? isHttpUrl(v.advertUrl) : v.advertUrl === null)
  )
}

export function isOlxDeliveryNoticeMeta(meta: unknown): meta is OlxDeliveryNoticeMeta {
  if (!isObject(meta)) return false
  return (
    meta.kind === "olx_delivery_notice" &&
    meta.schemaVersion === 1 &&
    typeof meta.notice === "string" &&
    meta.notice.length > 0 &&
    typeof meta.adminUrl === "string" &&
    isHttpUrl(meta.adminUrl) &&
    ("advert" in meta ? isOlxDeliveryAdvert(meta.advert) : true)
  )
}
