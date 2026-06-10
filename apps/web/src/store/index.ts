import { create } from "zustand"

import type { components, operations } from "@omnichat/api-client"

import { api } from "@/lib/api"
import { requestNotificationPermission } from "@/lib/notifications"
import { clearTokens, getAccessToken } from "@/lib/tokens"
import { toast } from "@/hooks/use-toast"
import type {
  AppSettings,
  Attachment,
  BuyerHistory,
  Conversation,
  Message,
  PaymentStatus,
  ShippingStatus,
  QuickShortcut,
  Status,
  Tag,
  Template,
  TemplateCategory,
  TemplateScope,
} from "@/types"

type ConversationDto = components["schemas"]["ConversationDto"]
type ConversationDetailsDto = components["schemas"]["ConversationDetailsDto"]
type ListConversationsResponseDto = components["schemas"]["ListConversationsResponseDto"]
type MessageDto = components["schemas"]["MessageDto"]
type ListMessagesResponseDto = components["schemas"]["ListMessagesResponseDto"]
type AroundMessagesResponseDto = components["schemas"]["AroundMessagesResponseDto"]
type MessageAttachmentDto = components["schemas"]["MessageAttachmentDto"]
type CreateShortLinkResponseDto = components["schemas"]["CreateShortLinkResponseDto"]
type SendAttachmentMultipartDto =
  operations["MessagesController_sendAttachment_v1"]["requestBody"]["content"]["multipart/form-data"]
type TagDto = components["schemas"]["TagDto"]
type StatusDto = components["schemas"]["StatusDto"]
type TemplateDto = components["schemas"]["TemplateDto"]
type TemplateCategoryDto = components["schemas"]["TemplateCategoryDto"]
type WorkspaceSettingsDto = components["schemas"]["WorkspaceSettingsDto"]
type InboxMetricsDto = components["schemas"]["InboxMetricsDto"]

const defaultShortcuts: QuickShortcut[] = [
  { id: "sc-1", label: "Реквізити", text: "Карта: 5168 XXXX XXXX XXXX\nОтримувач: ФОП Іваненко І.І.", icon: "💳" },
  { id: "sc-2", label: "НП доставка", text: "Доставка Новою Поштою 1-3 дні.\nВартість за тарифами перевізника.\nБезкоштовно від 2000 грн.", icon: "🚚" },
  { id: "sc-3", label: "Гарантія", text: "Гарантія 12 місяців. Сервіс-центр у Києві.", icon: "🛡️" },
  { id: "sc-4", label: "Графік роботи", text: "Пн-Пт: 9:00-18:00\nСб: 10:00-15:00\nНд: вихідний", icon: "🕐" },
]

function errorToMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

function is401(res: { response: Response }): boolean {
  return res.response.status === 401
}

function ensureAuthOrThrow(res: { response: Response }): void {
  if (res.response.status !== 401) return
  clearTokens()
  throw new Error("Unauthorized")
}

function toChannelType(input: unknown): Conversation["channelType"] {
  if (input === "PROM") return "prom"
  if (input === "ROZETKA") return "rozetka"
  return "olx"
}

function toMessageStatus(input: unknown): Message["status"] {
  switch (input) {
    case "SENDING":
      return "sending"
    case "SENT":
      return "sent"
    case "DELIVERED":
      return "delivered"
    case "READ":
      return "read"
    case "FAILED":
      return "error"
    default:
      return "sent"
  }
}

function toAttachmentType(kind: unknown): Attachment["type"] {
  if (kind === "IMAGE") return "image"
  if (kind === "VIDEO") return "video"
  return "document"
}

function toAttachment(dto: MessageAttachmentDto): Attachment {
  const kind = dto?.kind
  const name =
    typeof dto?.originalName === "string" && dto.originalName.length > 0
      ? dto.originalName
      : kind === "IMAGE"
        ? "Фото"
        : kind === "VIDEO"
          ? "Відео"
          : "Файл"

  return {
    id: String(dto?.id ?? ""),
    type: toAttachmentType(kind),
    name,
    ...(typeof dto?.mimeType === "string" ? { mimeType: dto.mimeType } : {}),
    ...(typeof dto?.sizeBytes === "number" ? { sizeBytes: dto.sizeBytes } : {}),
    // 7-day presigned download URL for IMAGE / VIDEO kinds — used by
    // MessageBubble to render <img> / <video> inline. Falls through as
    // undefined when the API didn't supply one (DOCUMENT, fallbacks).
    ...(typeof (dto as { previewUrl?: unknown })?.previewUrl === "string"
      ? { previewUrl: (dto as { previewUrl: string }).previewUrl }
      : {}),
  }
}

function toMessage(dto: MessageDto): Message {
  const ts = dto.sentAt ?? dto.createdAt
  const attachments = Array.isArray(dto.attachments) ? dto.attachments.map(toAttachment) : []
  const metadata = (dto as { metadata?: unknown }).metadata
  const clientMessageId = (dto as { clientMessageId?: string | null }).clientMessageId ?? null
  return {
    id: dto.id,
    conversationId: dto.conversationId,
    direction: dto.direction === "OUT" ? "out" : "in",
    text: dto.text ?? "",
    timestamp: ts,
    status: toMessageStatus(dto.deliveryStatus),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(metadata != null ? { metadata } : {}),
    ...(clientMessageId ? { clientMessageId } : {}),
  }
}

function toConversation(dto: ConversationDto): Conversation {
  const nowMs = Date.now()
  const snoozedUntilIso = dto.snoozedUntil ?? null
  const snoozedUntilMs = snoozedUntilIso ? new Date(snoozedUntilIso).getTime() : 0

  const lastMessageTime = dto.lastMessageAt ?? dto.lastActivityAt ?? new Date().toISOString()
  const lastMessageText = dto.lastMessageText ?? ""

  const base: Conversation = {
    id: dto.id,
    buyerName: dto.buyerDisplayName,
    channelType: toChannelType(dto.channel),
    accountId: dto.channelAccountId,
    lastMessage: typeof lastMessageText === "string" ? lastMessageText : "",
    lastMessageTime: typeof lastMessageTime === "string" ? lastMessageTime : new Date().toISOString(),
    unreadCount: dto.needsReply ? 1 : 0,
    needsReply: dto.needsReply,
    isPinned: dto.isPinnedInAll,
    isSnoozed: Boolean(snoozedUntilIso && snoozedUntilMs > nowMs),
    isArchived: dto.isArchived,
    tagIds: Array.isArray(dto.tagIds) ? dto.tagIds : [],
  }

  return {
    ...base,
    ...(dto.buyerAvatarUrl != null ? { buyerAvatar: dto.buyerAvatarUrl } : {}),
    ...(dto.buyerPhone != null ? { buyerPhone: dto.buyerPhone } : {}),
    ...(dto.channelAccountAlias != null ? { accountAlias: dto.channelAccountAlias } : {}),
    ...(snoozedUntilIso != null ? { snoozedUntil: snoozedUntilIso } : {}),
    ...(dto.statusId != null ? { statusId: dto.statusId } : {}),
    ...(dto.paymentStatus != null ? { paymentStatus: dto.paymentStatus as PaymentStatus } : {}),
    ...(dto.shippingStatus != null ? { shippingStatus: dto.shippingStatus as ShippingStatus } : {}),
    ...(dto.ttn != null ? { ttn: dto.ttn } : {}),
    ...(dto.orderAmount != null ? { orderAmount: dto.orderAmount } : {}),
    ...(dto.sellerNote != null ? { sellerNote: dto.sellerNote } : {}),
    ...(dto.followUpAt != null ? { followUpAt: dto.followUpAt } : {}),
    ...(dto.buyerHistory != null ? { buyerHistory: dto.buyerHistory as unknown as BuyerHistory } : {}),
    ...(dto.isOnline != null ? { isOnline: Boolean(dto.isOnline) } : {}),
    ...(dto.lastSeen != null ? { lastSeen: dto.lastSeen } : {}),
  }
}

function mergeConversationDetails(prev: Conversation, dto: ConversationDetailsDto): Conversation {
  const next: Conversation = { ...prev }

  next.accountId = dto.channelAccountId

  if (dto.channelAccountAlias === null) delete next.accountAlias
  else if (typeof dto.channelAccountAlias === "string") next.accountAlias = dto.channelAccountAlias

  if (dto.contextType === null) delete next.contextType
  else if (typeof dto.contextType === "string") next.contextType = dto.contextType

  if (dto.contextTitle === null) delete next.contextTitle
  else if (typeof dto.contextTitle === "string") next.contextTitle = dto.contextTitle

  if (dto.contextPrice === null) delete next.contextPrice
  else if (typeof dto.contextPrice === "number") next.contextPrice = dto.contextPrice

  if (dto.contextCurrency === null) delete next.contextCurrency
  else if (typeof dto.contextCurrency === "string") next.contextCurrency = dto.contextCurrency

  if (dto.contextThumbUrl === null) delete next.contextThumbUrl
  else if (typeof dto.contextThumbUrl === "string") next.contextThumbUrl = dto.contextThumbUrl

  if (dto.contextExternalUrl === null) delete next.contextExternalUrl
  else if (typeof dto.contextExternalUrl === "string") next.contextExternalUrl = dto.contextExternalUrl

  if (dto.contextExternalId === null) delete next.contextExternalId
  else if (typeof dto.contextExternalId === "string") next.contextExternalId = dto.contextExternalId

  if (dto.contextStatusId === null) delete next.contextStatusId
  else if (typeof dto.contextStatusId === "string") next.contextStatusId = dto.contextStatusId

  if (dto.contextStatusName === null) delete next.contextStatusName
  else if (typeof dto.contextStatusName === "string") next.contextStatusName = dto.contextStatusName

  if (dto.paymentStatus === null) delete next.paymentStatus
  else if (typeof dto.paymentStatus === "string") next.paymentStatus = dto.paymentStatus as PaymentStatus

  if (dto.shippingStatus === null) delete next.shippingStatus
  else if (typeof dto.shippingStatus === "string") next.shippingStatus = dto.shippingStatus as ShippingStatus

  if (dto.ttn === null) delete next.ttn
  else if (typeof dto.ttn === "string") next.ttn = dto.ttn

  if (dto.orderAmount === null) delete next.orderAmount
  else if (typeof dto.orderAmount === "number") next.orderAmount = dto.orderAmount

  if (dto.sellerNote === null) delete next.sellerNote
  else if (typeof dto.sellerNote === "string") next.sellerNote = dto.sellerNote

  if (dto.followUpAt === null) delete next.followUpAt
  else if (typeof dto.followUpAt === "string") next.followUpAt = dto.followUpAt

  if (dto.buyerHistory === null) delete next.buyerHistory
  else if (dto.buyerHistory != null) next.buyerHistory = dto.buyerHistory as unknown as BuyerHistory

  if (dto.isOnline === null) delete next.isOnline
  else if (typeof dto.isOnline === "boolean") next.isOnline = dto.isOnline

  if (dto.lastSeen === null) delete next.lastSeen
  else if (typeof dto.lastSeen === "string") next.lastSeen = dto.lastSeen

  return next
}

function toTag(dto: TagDto): Tag {
  return {
    id: dto.id,
    name: dto.name,
    color: dto.color,
    icon: dto.icon,
  }
}

function toStatus(dto: StatusDto): Status {
  return {
    id: dto.id,
    name: dto.name,
    color: dto.color,
    icon: dto.icon,
  }
}

function toTemplate(dto: TemplateDto, categoriesById: Map<string, TemplateCategoryDto>): Template {
  const scope: Template["scope"] =
    dto.scope === "GLOBAL"
      ? "global"
      : dto.channel === "PROM"
        ? "prom"
        : "olx"

  const categoryName = dto.categoryId ? categoriesById.get(dto.categoryId)?.name ?? "custom" : "custom"
  const categoryKey: TemplateCategory =
    categoryName === "payment" ||
    categoryName === "delivery" ||
    categoryName === "upsell" ||
    categoryName === "issues" ||
    categoryName === "custom"
      ? categoryName
      : "custom"

  return {
    id: dto.id,
    title: dto.title,
    text: dto.content,
    // NOTE: prototype types model scope as global|olx|prom. We map API scope/channel into this.
    scope,
    category: categoryKey,
    ...(dto.categoryId != null ? { categoryId: dto.categoryId } : {}),
    ...(categoryKey === "custom" && categoryName !== "custom" ? { categoryName } : {}),
  }
}

function newClientMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `web_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function updateConversationInList(list: Conversation[], next: Conversation): Conversation[] {
  const idx = list.findIndex((c) => c.id === next.id)
  if (idx === -1) return [next, ...list]
  const copy = list.slice()
  copy[idx] = { ...copy[idx], ...next }
  return copy
}

// Move the merged conversation to position 0 — for events that imply
// fresh activity (new inbound, new outbound) the inbox UX expects the
// thread to bubble to the top. The plain `updateConversationInList`
// keeps the existing index so non-activity updates (pin/unpin, tag
// add/remove, status change from controller responses) don't reshuffle
// the list.
function bumpConversationToTop(list: Conversation[], next: Conversation): Conversation[] {
  const idx = list.findIndex((c) => c.id === next.id)
  if (idx === -1) return [next, ...list]
  const merged = { ...list[idx], ...next }
  const without = list.slice(0, idx).concat(list.slice(idx + 1))
  return [merged, ...without]
}

function applyConversationPatchToConversation(prev: Conversation, patch: Record<string, unknown>): Conversation {
  const nowMs = Date.now()

  const next: Conversation = { ...prev }

  if (typeof patch.needsReply === "boolean") {
    next.needsReply = patch.needsReply
    // Product rule: "Unread" === needsReply (it must not be cleared by opening chat).
    next.unreadCount = patch.needsReply ? 1 : 0
  }

  if (typeof patch.isArchived === "boolean") next.isArchived = patch.isArchived

  if (typeof patch.isPinnedInAll === "boolean") next.isPinned = patch.isPinnedInAll

  if (patch.snoozedUntil === null) {
    delete next.snoozedUntil
    next.isSnoozed = false
  } else if (typeof patch.snoozedUntil === "string") {
    next.snoozedUntil = patch.snoozedUntil
    next.isSnoozed = new Date(patch.snoozedUntil).getTime() > nowMs
  }

  if (patch.statusId === null) delete next.statusId
  else if (typeof patch.statusId === "string") next.statusId = patch.statusId

  if (Array.isArray(patch.tagIds)) next.tagIds = patch.tagIds.map(String)

  if (typeof patch.lastActivityAt === "string") next.lastMessageTime = patch.lastActivityAt

  if (patch.contextStatusId === null) delete next.contextStatusId
  else if (typeof patch.contextStatusId === "string") next.contextStatusId = patch.contextStatusId

  if (patch.contextStatusName === null) delete next.contextStatusName
  else if (typeof patch.contextStatusName === "string") next.contextStatusName = patch.contextStatusName

  if (patch.paymentStatus === null) delete next.paymentStatus
  else if (typeof patch.paymentStatus === "string") next.paymentStatus = patch.paymentStatus as PaymentStatus

  if (patch.shippingStatus === null) delete next.shippingStatus
  else if (typeof patch.shippingStatus === "string") next.shippingStatus = patch.shippingStatus as ShippingStatus

  if (patch.ttn === null) delete next.ttn
  else if (typeof patch.ttn === "string") next.ttn = patch.ttn

  if (patch.orderAmount === null) delete next.orderAmount
  else if (typeof patch.orderAmount === "number") next.orderAmount = patch.orderAmount
  else if (typeof patch.orderAmount === "string") {
    const n = Number(patch.orderAmount)
    if (Number.isFinite(n)) next.orderAmount = n
  }

  if (patch.sellerNote === null) delete next.sellerNote
  else if (typeof patch.sellerNote === "string") next.sellerNote = patch.sellerNote

  if (patch.followUpAt === null) delete next.followUpAt
  else if (typeof patch.followUpAt === "string") next.followUpAt = patch.followUpAt

  if (patch.buyerHistory === null) delete next.buyerHistory
  else if (patch.buyerHistory != null) next.buyerHistory = patch.buyerHistory as unknown as BuyerHistory

  if (patch.isOnline === null) delete next.isOnline
  else if (typeof patch.isOnline === "boolean") next.isOnline = patch.isOnline

  if (patch.lastSeen === null) delete next.lastSeen
  else if (typeof patch.lastSeen === "string") next.lastSeen = patch.lastSeen

  return next
}

function applyMessagePatchToMessage(prev: Message, patch: Record<string, unknown>): Message {
  const next: Message = { ...prev }

  if (typeof patch.text === "string") next.text = patch.text

  if (typeof patch.deliveryStatus === "string") {
    next.status = toMessageStatus(patch.deliveryStatus)
  }

  if (Array.isArray(patch.attachments)) {
    const atts = patch.attachments.map(toAttachment).filter((a) => a.id.length > 0)
    if (atts.length > 0) next.attachments = atts
    else delete next.attachments
  }

  return next
}

interface AppState {
  bootstrapping: boolean
  bootstrapped: boolean
  bootstrapError: string | null

  conversations: Conversation[]
  messages: Record<string, Message[]>
  tags: Tag[]
  statuses: Status[]
  templates: Template[]
  templateCategories: TemplateCategoryDto[]
  shortcuts: QuickShortcut[]
  settings: AppSettings
  inboxMetrics: InboxMetricsDto | null

  selectedConversationId: string | null
  // Inbox tab/filter selection lives in the global store (and persists across
  // navigation) so switching to a chat and back, or hitting deep-link URLs
  // like /inbox/<id>, doesn't reset the operator's filter to "Усі". The
  // string union here mirrors `InboxTab` in components/inbox/InboxTabs.tsx.
  activeInboxTab: "all" | "unread" | "olx" | "prom" | "rozetka" | "snoozed" | "archive"
  setActiveInboxTab: (tab: AppState["activeInboxTab"]) => void
  searchQuery: string
  bulkSelectedIds: string[]
  showBuyerSidebar: boolean

  bootstrap: () => Promise<void>
  refreshInbox: () => Promise<void>
  refreshInboxMetrics: () => void
  applyConversationPatch: (conversationId: string, patch: Record<string, unknown>) => void
  applyMessagePatch: (messageId: string, patch: Record<string, unknown>) => void
  ingestMessage: (conversationId: string, message: Record<string, unknown>) => void

  selectConversation: (id: string | null) => void
  jumpToMessage: (conversationId: string, messageId: string) => void
  setSearchQuery: (query: string) => void

  pinConversation: (id: string) => void
  unpinConversation: (id: string) => void
  snoozeConversation: (id: string, until: string) => void
  unsnoozeConversation: (id: string) => void
  archiveConversation: (id: string) => void
  unarchiveConversation: (id: string) => void

  setConversationStatus: (conversationId: string, statusId: string | undefined) => void
  addTagToConversation: (conversationId: string, tagId: string) => void
  removeTagFromConversation: (conversationId: string, tagId: string) => void
  setConversationTags: (conversationId: string, tagIds: string[]) => void

  sendMessage: (conversationId: string, text: string, replyTo?: string) => void
  sendAttachment: (conversationId: string, file: File) => void
  openAttachment: (attachmentId: string) => void
  markAsRead: (conversationId: string) => void

  updateSettings: (settings: Partial<AppSettings>) => void

  // Seller features (prototype-only for now)
  setSellerNote: (id: string, note: string) => void
  setTtn: (id: string, ttn: string) => void
  setPaymentStatus: (id: string, status: PaymentStatus) => void
  setFollowUp: (id: string, date: string | undefined) => void

  // Management
  createTag: (input: { name: string; color: string; icon: string }) => Promise<void>
  updateTag: (tagId: string, input: { name: string; color: string; icon: string }) => Promise<void>
  deleteTag: (tagId: string) => Promise<void>

  createStatus: (input: { name: string; color: string; icon: string }) => Promise<void>
  updateStatus: (statusId: string, input: { name: string; color: string; icon: string }) => Promise<void>
  deleteStatus: (statusId: string) => Promise<void>

  createTemplate: (input: { scope: TemplateScope; title: string; text: string; category: TemplateCategory }) => Promise<void>
  updateTemplate: (templateId: string, input: { title: string; text: string; category: TemplateCategory }) => Promise<void>
  deleteTemplate: (templateId: string) => Promise<void>

  // Bulk actions
  toggleBulkSelect: (id: string) => void
  clearBulkSelection: () => void
  bulkArchive: () => void
  bulkTag: (tagId: string) => void

  toggleBuyerSidebar: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  bootstrapping: false,
  bootstrapped: false,
  bootstrapError: null,

  conversations: [],
  messages: {},
  tags: [],
  statuses: [],
  templates: [],
  templateCategories: [],
  shortcuts: defaultShortcuts,
  settings: {
    darkMode: true,
    autoArchiveDays: 7,
    openOnPlatform: false,
    notifications: {
      messages: true,
      errors: true,
      reminders: true,
      system: false,
      sound: true,
      osPopup: true,
      inAppToast: true,
    },
    density: "comfortable",
    autoReplyEnabled: false,
    autoReplyText: "Дякуємо за повідомлення! Ми відповімо найближчим часом.",
  },
  inboxMetrics: null,

  selectedConversationId: null,
  activeInboxTab: "all",
  setActiveInboxTab: (tab) => set({ activeInboxTab: tab }),
  searchQuery: "",
  bulkSelectedIds: [],
  showBuyerSidebar: false,

  bootstrap: async () => {
    if (get().bootstrapped || get().bootstrapping) return

    const token = getAccessToken()
    if (!token) return

    set({ bootstrapping: true, bootstrapError: null })
    try {
      const [tagsRes, statusesRes, settingsRes, categoriesRes, templatesRes, convAllRes, convArchivedRes] =
        await Promise.all([
        api.GET("/v1/tags"),
        api.GET("/v1/statuses"),
        api.GET("/v1/settings"),
        api.GET("/v1/templates/categories"),
        api.GET("/v1/templates"),
        api.GET("/v1/conversations", { params: { query: { folder: "ALL", limit: 100 } } }),
        api.GET("/v1/conversations", { params: { query: { folder: "ARCHIVED", limit: 100 } } }),
      ])

      if ([tagsRes, statusesRes, settingsRes, categoriesRes, templatesRes, convAllRes, convArchivedRes].some(is401)) {
        clearTokens()
        set({ bootstrapping: false, bootstrapped: false })
        return
      }

      if (
        !tagsRes.data ||
        !statusesRes.data ||
        !settingsRes.data ||
        !categoriesRes.data ||
        !templatesRes.data ||
        !convAllRes.data ||
        !convArchivedRes.data
      ) {
        throw new Error("Bootstrap failed: missing data")
      }

      const tags = (tagsRes.data as TagDto[]).map(toTag)
      const statuses = (statusesRes.data as StatusDto[]).map(toStatus)

      const serverSettings = settingsRes.data as WorkspaceSettingsDto
      const baseSettings = get().settings
      const mergedSettings: AppSettings = {
        ...baseSettings,
        autoArchiveDays: typeof serverSettings.autoArchiveDays === "number" ? serverSettings.autoArchiveDays : baseSettings.autoArchiveDays,
        openOnPlatform: Boolean(serverSettings.openContextExternalDirect ?? baseSettings.openOnPlatform),
        notifications: {
          ...baseSettings.notifications,
          messages: Boolean(serverSettings.pushNewMessageEnabled ?? baseSettings.notifications.messages),
          errors: Boolean(serverSettings.pushSendErrorEnabled ?? baseSettings.notifications.errors),
          system: Boolean(serverSettings.pushSyncErrorEnabled ?? baseSettings.notifications.system),
        },
      }

      const categories = categoriesRes.data as TemplateCategoryDto[]
      const categoriesById = new Map(categories.map((c) => [c.id, c] as const))
      const templates = (templatesRes.data as TemplateDto[]).map((t) => toTemplate(t, categoriesById))
      const templateCategories = categoriesRes.data as TemplateCategoryDto[]

      const listAll = convAllRes.data as ListConversationsResponseDto
      const pinnedAll = Array.isArray(listAll.pinned) ? listAll.pinned : []
      const itemsAll = Array.isArray(listAll.items) ? listAll.items : []

      const listArchived = convArchivedRes.data as ListConversationsResponseDto
      const itemsArchived = Array.isArray(listArchived.items) ? listArchived.items : []

      const conversations = [...pinnedAll, ...itemsAll, ...itemsArchived].map(toConversation)

      set({
        conversations,
        tags,
        statuses,
        templates,
        templateCategories,
        settings: mergedSettings,
        bootstrapped: true,
      })

      // Metrics are non-critical; refresh after core bootstrap succeeds.
      get().refreshInboxMetrics()
    } catch (e: unknown) {
      set({ bootstrapError: errorToMessage(e), bootstrapped: false })
    } finally {
      set({ bootstrapping: false })
    }
  },

  refreshInboxMetrics: () => {
    const token = getAccessToken()
    if (!token) return
    void (async () => {
      try {
        const res = await api.GET("/v1/metrics/inbox")
        ensureAuthOrThrow(res)
        if (!res.data) return
        set({ inboxMetrics: res.data as InboxMetricsDto })
      } catch {
        // Non-critical; ignore.
      }
    })()
  },

  refreshInbox: async () => {
    const token = getAccessToken()
    if (!token) return

    const [convAllRes, convArchivedRes] = await Promise.all([
      api.GET("/v1/conversations", { params: { query: { folder: "ALL", limit: 100 } } }),
      api.GET("/v1/conversations", { params: { query: { folder: "ARCHIVED", limit: 100 } } }),
    ])
    if (is401(convAllRes) || is401(convArchivedRes)) {
      clearTokens()
      return
    }
    if (!convAllRes.data || !convArchivedRes.data) return

    const listAll = convAllRes.data as ListConversationsResponseDto
    const pinnedAll = Array.isArray(listAll.pinned) ? listAll.pinned : []
    const itemsAll = Array.isArray(listAll.items) ? listAll.items : []

    const listArchived = convArchivedRes.data as ListConversationsResponseDto
    const itemsArchived = Array.isArray(listArchived.items) ? listArchived.items : []

    set((state) => ({
      conversations: [...pinnedAll, ...itemsAll, ...itemsArchived].map(toConversation),
      messages: state.messages,
    }))
    get().refreshInboxMetrics()
  },

  applyConversationPatch: (conversationId, patch) =>
    set((state) => {
      const idx = state.conversations.findIndex((c) => c.id === conversationId)
      if (idx === -1) return state
      const next = applyConversationPatchToConversation(state.conversations[idx], patch)
      const updated = state.conversations.slice()
      updated[idx] = next
      return { conversations: updated }
    }),

  applyMessagePatch: (messageId, patch) =>
    set((state) => {
      let changed = false
      const nextMessages: typeof state.messages = { ...state.messages }

      for (const [conversationId, list] of Object.entries(state.messages)) {
        const idx = list.findIndex((m) => m.id === messageId)
        if (idx === -1) continue
        const updated = list.slice()
        updated[idx] = applyMessagePatchToMessage(updated[idx], patch)
        nextMessages[conversationId] = updated
        changed = true
        break
      }

      return changed ? { messages: nextMessages } : state
    }),

  ingestMessage: (conversationId, message) =>
    set((state) => {
      const dto = message as unknown as MessageDto
      const msg = toMessage(dto)

      // Dedup: match by id (already-ingested) OR by clientMessageId (the
      // optimistic placeholder we just wrote — its id is "optimistic-<cid>"
      // but the persisted broadcast carries the same clientMessageId).
      // Without this, the WebSocket event racing the POST response left
      // both the optimistic+swap AND the broadcast in the list → "класика
      // чатів" double-message.
      const prevMsgs = state.messages[conversationId] ?? []
      const matchIdx = prevMsgs.findIndex(
        (m) => m.id === msg.id || (msg.clientMessageId != null && m.clientMessageId === msg.clientMessageId),
      )
      const nextMsgs =
        matchIdx >= 0
          ? prevMsgs.map((m, i) => (i === matchIdx ? msg : m))
          : [...prevMsgs, msg]

      const conv = state.conversations.find((c) => c.id === conversationId)
      const lastMessageFallback =
        msg.text || (msg.attachments && msg.attachments.length > 0 ? `📎 ${msg.attachments[0].name}` : "")
      const nextConv = conv
        ? {
            ...conv,
            lastMessage: lastMessageFallback || conv.lastMessage,
            lastMessageTime: msg.timestamp || conv.lastMessageTime,
            ...(msg.direction === "in"
              ? { needsReply: true, unreadCount: 1 }
              : {}),
          }
        : null

      return {
        messages: { ...state.messages, [conversationId]: nextMsgs },
        conversations: nextConv ? bumpConversationToTop(state.conversations, nextConv) : state.conversations,
      }
    }),

  selectConversation: (id) => {
    set({ selectedConversationId: id })
    if (!id) return

    // First chat-open after page load is a user gesture; piggy-back on
    // it to ask for browser notification permission. Idempotent: if
    // already granted/denied it's a no-op, so we don't spam the user.
    // Direct call (was a dynamic import previously — slow networks or
    // bundle splits could race the user's next click).
    void requestNotificationPermission()

    const token = getAccessToken()
    if (!token) return

    void (async () => {
      try {
        const [detailsRes, messagesRes] = await Promise.all([
          api.GET("/v1/conversations/{conversationId}", { params: { path: { conversationId: id } } }),
          api.GET("/v1/conversations/{conversationId}/messages", { params: { path: { conversationId: id }, query: { limit: 200 } } }),
        ])

        if (is401(detailsRes) || is401(messagesRes)) {
          clearTokens()
          return
        }
        if (!detailsRes.data || !messagesRes.data) throw new Error("Failed to load conversation")

        const details = detailsRes.data as ConversationDetailsDto
        const items = (messagesRes.data as ListMessagesResponseDto).items
        // API returns messages in `createdAt: desc` order for cursor pagination
        // (newest first → scroll up for history). Chat UI renders top-to-bottom
        // with oldest on top and newest on bottom, so reverse here.
        const mapped = Array.isArray(items) ? items.map(toMessage).reverse() : []

        set((state) => {
          const existing = state.conversations.find((c) => c.id === id) ?? toConversation(details)
          const merged = mergeConversationDetails(existing, details)
          return {
            conversations: updateConversationInList(state.conversations, merged),
            messages: { ...state.messages, [id]: mapped },
          }
        })
      } catch (e: unknown) {
        toast({ title: "Помилка", description: errorToMessage(e) })
      }
    })()
  },

  jumpToMessage: (conversationId, messageId) => {
    set({ selectedConversationId: conversationId })

    const token = getAccessToken()
    if (!token) return

    void (async () => {
      try {
        const [detailsRes, aroundRes] = await Promise.all([
          api.GET("/v1/conversations/{conversationId}", { params: { path: { conversationId } } }),
          api.GET("/v1/conversations/{conversationId}/messages/around/{messageId}", {
            params: { path: { conversationId, messageId }, query: { limit: 151 } },
          }),
        ])

        if (is401(detailsRes) || is401(aroundRes)) {
          clearTokens()
          return
        }
        if (!detailsRes.data || !aroundRes.data) throw new Error("Failed to load around messages")

        const details = detailsRes.data as ConversationDetailsDto
        const items = (aroundRes.data as AroundMessagesResponseDto).items
        // Same DESC-from-API → ASC-for-render reversal as the regular list path.
        const mapped = Array.isArray(items) ? items.map(toMessage).reverse() : []

        set((state) => {
          const existing = state.conversations.find((c) => c.id === conversationId) ?? toConversation(details)
          const merged = mergeConversationDetails(existing, details)
          return {
            conversations: updateConversationInList(state.conversations, merged),
            messages: { ...state.messages, [conversationId]: mapped },
          }
        })
      } catch (e: unknown) {
        toast({ title: "Помилка", description: errorToMessage(e) })
      }
    })()
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  pinConversation: (id) => {
    const token = getAccessToken()
    if (!token) return
    void (async () => {
      try {
        const res = await api.POST("/v1/conversations/{conversationId}/pin", { params: { path: { conversationId: id } } })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Pin failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch (e: unknown) {
        toast({ title: "Не вдалося закріпити", description: errorToMessage(e) })
      }
    })()
  },

  unpinConversation: (id) => {
    const token = getAccessToken()
    if (!token) return
    void (async () => {
      try {
        const res = await api.POST("/v1/conversations/{conversationId}/unpin", { params: { path: { conversationId: id } } })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Unpin failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch (e: unknown) {
        toast({ title: "Не вдалося відкріпити", description: errorToMessage(e) })
      }
    })()
  },

  snoozeConversation: (id, until) => {
    const token = getAccessToken()
    if (!token) return
    void (async () => {
      try {
        const res = await api.POST("/v1/conversations/{conversationId}/snooze", {
          params: { path: { conversationId: id } },
          body: { until },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Snooze failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch (e: unknown) {
        toast({ title: "Не вдалося snooze", description: errorToMessage(e) })
      }
    })()
  },

  unsnoozeConversation: (id) => {
    const token = getAccessToken()
    if (!token) return
    void (async () => {
      try {
        const res = await api.POST("/v1/conversations/{conversationId}/unsnooze", { params: { path: { conversationId: id } } })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Unsnooze failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch (e: unknown) {
        toast({ title: "Не вдалося зняти snooze", description: errorToMessage(e) })
      }
    })()
  },

  archiveConversation: (id) => {
    const token = getAccessToken()
    if (!token) return

    const conv = get().conversations.find((c) => c.id === id) ?? null
    let confirmUnpin = false
    if (conv?.isPinned) {
      confirmUnpin = window.confirm('Діалог закріплено. "Відкріпити та архівувати"?')
      if (!confirmUnpin) return
    }

    void (async () => {
      try {
        const res = await api.POST("/v1/conversations/{conversationId}/archive", {
          params: { path: { conversationId: id } },
          body: confirmUnpin ? { confirmUnpin: true } : {},
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Archive failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch (e: unknown) {
        toast({ title: "Не вдалося архівувати", description: errorToMessage(e) })
      }
    })()
  },

  unarchiveConversation: (id) => {
    const token = getAccessToken()
    if (!token) return
    void (async () => {
      try {
        const res = await api.POST("/v1/conversations/{conversationId}/unarchive", { params: { path: { conversationId: id } } })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Unarchive failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch (e: unknown) {
        toast({ title: "Не вдалося розархівувати", description: errorToMessage(e) })
      }
    })()
  },

  setConversationStatus: (conversationId, statusId) => {
    const token = getAccessToken()
    if (!token) return

    void (async () => {
      try {
        const res = await api.POST("/v1/conversations/{conversationId}/status", {
          params: { path: { conversationId } },
          body: { statusId: statusId ?? null },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Set status failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch (e: unknown) {
        toast({ title: "Не вдалося змінити статус", description: errorToMessage(e) })
      }
    })()
  },

  addTagToConversation: (conversationId, tagId) => {
    const conv = get().conversations.find((c) => c.id === conversationId) ?? null
    const next = conv ? Array.from(new Set([...conv.tagIds, tagId])) : [tagId]
    get().setConversationTags(conversationId, next)
  },

  removeTagFromConversation: (conversationId, tagId) => {
    const conv = get().conversations.find((c) => c.id === conversationId) ?? null
    const next = conv ? conv.tagIds.filter((t) => t !== tagId) : []
    get().setConversationTags(conversationId, next)
  },

  // Internal helper, but kept on state for re-use.
  setConversationTags: (conversationId: string, tagIds: string[]) => {
    const token = getAccessToken()
    if (!token) return
    void (async () => {
      try {
        const res = await api.POST("/v1/conversations/{conversationId}/tags", {
          params: { path: { conversationId } },
          body: { tagIds },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Set tags failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch (e: unknown) {
        toast({ title: "Не вдалося змінити теги", description: errorToMessage(e) })
      }
    })()
  },

  sendMessage: (conversationId, text, replyTo) => {
    const token = getAccessToken()
    if (!token) return

    const now = new Date().toISOString()
    const clientMessageId = newClientMessageId()

    const optimistic: Message = {
      id: `optimistic-${clientMessageId}`,
      conversationId,
      direction: "out",
      text,
      timestamp: now,
      status: "sending",
      clientMessageId,
      ...(replyTo !== undefined ? { replyTo } : {}),
    }

    set((state) => ({
      messages: { ...state.messages, [conversationId]: [...(state.messages[conversationId] ?? []), optimistic] },
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, lastMessage: text, lastMessageTime: now } : c,
      ),
    }))

    void (async () => {
      try {
        const res = await api.POST("/v1/conversations/{conversationId}/messages", {
          params: { path: { conversationId } },
          body: { clientMessageId, text },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Send failed")

        const sent = toMessage(res.data as MessageDto)
        set((state) => {
          const list = state.messages[conversationId] ?? []
          // Drop any rows the WebSocket broadcast may have ingested before
          // this POST returned (it carries the same clientMessageId), and
          // swap the optimistic placeholder with the persisted message.
          const cleaned = list.filter(
            (m) => m.id !== sent.id && !(m.clientMessageId === clientMessageId && m.id !== optimistic.id),
          )
          return {
            messages: {
              ...state.messages,
              [conversationId]: cleaned.map((m) => (m.id === optimistic.id ? sent : m)),
            },
          }
        })
      } catch (e: unknown) {
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: (state.messages[conversationId] ?? []).map((m) =>
              m.id === optimistic.id ? { ...m, status: "error" } : m,
            ),
          },
        }))
        toast({ title: "Не вдалося відправити", description: errorToMessage(e) })
      }
    })()
  },

  sendAttachment: (conversationId, file) => {
    const token = getAccessToken()
    if (!token) return

    const now = new Date().toISOString()
    const clientMessageId = newClientMessageId()

    const mimeType = file.type || "application/octet-stream"
    const kind: Attachment["type"] = mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("video/")
        ? "video"
        : "document"

    const optimistic: Message = {
      id: `optimistic-${clientMessageId}`,
      conversationId,
      direction: "out",
      text: "",
      timestamp: now,
      status: "sending",
      clientMessageId,
      attachments: [
        {
          id: `optimistic-att-${clientMessageId}`,
          type: kind,
          name: file.name,
          mimeType,
          sizeBytes: file.size,
        },
      ],
    }

    set((state) => ({
      messages: { ...state.messages, [conversationId]: [...(state.messages[conversationId] ?? []), optimistic] },
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, lastMessage: `📎 ${file.name}`, lastMessageTime: now } : c,
      ),
    }))

    void (async () => {
      try {
        const form = new FormData()
        form.append("clientMessageId", clientMessageId)
        form.append("file", file)

        const res = await api.POST("/v1/conversations/{conversationId}/messages/attachment", {
          params: { path: { conversationId } },
          body: form as unknown as SendAttachmentMultipartDto,
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Send attachment failed")

        const sent = toMessage(res.data as MessageDto)
        set((state) => {
          const list = state.messages[conversationId] ?? []
          const cleaned = list.filter(
            (m) => m.id !== sent.id && !(m.clientMessageId === clientMessageId && m.id !== optimistic.id),
          )
          return {
            messages: {
              ...state.messages,
              [conversationId]: cleaned.map((m) => (m.id === optimistic.id ? sent : m)),
            },
          }
        })
      } catch (e: unknown) {
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: (state.messages[conversationId] ?? []).map((m) =>
              m.id === optimistic.id ? { ...m, status: "error" } : m,
            ),
          },
        }))
        toast({ title: "Не вдалося відправити файл", description: errorToMessage(e) })
      }
    })()
  },

  openAttachment: (attachmentId) => {
    const token = getAccessToken()
    if (!token) return

    void (async () => {
      try {
        const res = await api.POST("/v1/attachments/{attachmentId}/short-link", {
          params: { path: { attachmentId } },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Create short link failed")
        const url = String((res.data as CreateShortLinkResponseDto).url ?? "")
        if (!url) throw new Error("Short link url missing")

        const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4121"
        const full = new URL(url, base).toString()

        try {
          await navigator.clipboard.writeText(full)
        } catch {
          // ignore
        }

        const opened = window.open(full, "_blank", "noopener,noreferrer")
        toast({
          title: opened ? "Відкрито вкладення" : "Посилання скопійовано",
          description: opened ? "Коротке посилання діє 7 днів" : full,
        })
      } catch (e: unknown) {
        toast({ title: "Не вдалося відкрити вкладення", description: errorToMessage(e) })
      }
    })()
  },

  markAsRead: (conversationId) => {
    // Product rule (unchanged): opening/reading must NOT clear
    // needsReply/unread in OUR state — operator can still see "this
    // chat hasn't been answered yet" until they actually reply.
    //
    // What we DO want: tell the upstream channel (e.g. OLX) that the
    // operator has seen the thread, so the seller's OLX inbox shows
    // it as read. Fire-and-forget POST; failures stay server-side.
    const token = getAccessToken()
    if (!token) return
    void (async () => {
      try {
        await api.POST("/v1/conversations/{conversationId}/mark-read", {
          params: { path: { conversationId } },
        })
      } catch {
        // Best-effort — operator's UX is unaffected.
      }
    })()
  },

  updateSettings: (input) => {
    set((state) => ({ settings: { ...state.settings, ...input } }))

    const token = getAccessToken()
    if (!token) return

    const next = { ...get().settings, ...input }
    void (async () => {
      try {
        const res = await api.PATCH("/v1/settings", {
          body: {
            autoArchiveDays: next.autoArchiveDays,
            openContextExternalDirect: next.openOnPlatform,
            pushNewMessageEnabled: next.notifications.messages,
            pushSendErrorEnabled: next.notifications.errors,
            pushSyncErrorEnabled: next.notifications.system,
          },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Save settings failed")
      } catch (e: unknown) {
        toast({ title: "Не вдалося зберегти налаштування", description: errorToMessage(e) })
      }
    })()
  },

  setSellerNote: (id, note) => {
    const token = getAccessToken()
    if (!token) return

    const prev = get().conversations.find((c) => c.id === id) ?? null
    get().applyConversationPatch(id, { sellerNote: note })

    void (async () => {
      try {
        const res = await api.PATCH("/v1/conversations/{conversationId}/meta", {
          params: { path: { conversationId: id } },
          body: { sellerNote: note },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Update failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch (e: unknown) {
        if (prev) set((state) => ({ conversations: updateConversationInList(state.conversations, prev) }))
        toast({ title: "Не вдалося зберегти нотатку", description: errorToMessage(e) })
      }
    })()
  },

  setTtn: (id, ttn) => {
    const token = getAccessToken()
    if (!token) return

    const prev = get().conversations.find((c) => c.id === id) ?? null
    get().applyConversationPatch(id, { ttn, shippingStatus: "shipped" })

    void (async () => {
      try {
        const res = await api.PATCH("/v1/conversations/{conversationId}/meta", {
          params: { path: { conversationId: id } },
          body: { ttn, shippingStatus: "shipped" },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Update failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch (e: unknown) {
        if (prev) set((state) => ({ conversations: updateConversationInList(state.conversations, prev) }))
        toast({ title: "Не вдалося зберегти ТТН", description: errorToMessage(e) })
      }
    })()
  },

  setPaymentStatus: (id, status) => {
    const token = getAccessToken()
    if (!token) return

    const prev = get().conversations.find((c) => c.id === id) ?? null
    get().applyConversationPatch(id, { paymentStatus: status })

    void (async () => {
      try {
        const res = await api.PATCH("/v1/conversations/{conversationId}/meta", {
          params: { path: { conversationId: id } },
          body: { paymentStatus: status },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Update failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch (e: unknown) {
        if (prev) set((state) => ({ conversations: updateConversationInList(state.conversations, prev) }))
        toast({ title: "Не вдалося змінити статус оплати", description: errorToMessage(e) })
      }
    })()
  },

  setFollowUp: (id, date) => {
    const token = getAccessToken()
    if (!token) return

    const prev = get().conversations.find((c) => c.id === id) ?? null
    get().applyConversationPatch(id, { followUpAt: date ?? null })

    void (async () => {
      try {
        const res = await api.PATCH("/v1/conversations/{conversationId}/meta", {
          params: { path: { conversationId: id } },
          body: { followUpAt: date ?? null },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Update failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch (e: unknown) {
        if (prev) set((state) => ({ conversations: updateConversationInList(state.conversations, prev) }))
        toast({ title: "Не вдалося оновити нагадування", description: errorToMessage(e) })
      }
    })()
  },

  createTag: async (input) => {
    const token = getAccessToken()
    if (!token) return
    try {
      const res = await api.POST("/v1/tags", { body: input })
      ensureAuthOrThrow(res)
      if (!res.data) throw new Error("Create tag failed")
      const dto = res.data as TagDto
      const tag = toTag(dto)
      set((state) => ({ tags: [tag, ...state.tags] }))
    } catch (e: unknown) {
      toast({ title: "Не вдалося створити тег", description: errorToMessage(e) })
    }
  },

  updateTag: async (tagId, input) => {
    const token = getAccessToken()
    if (!token) return
    try {
      const res = await api.PATCH("/v1/tags/{tagId}", { params: { path: { tagId } }, body: input })
      ensureAuthOrThrow(res)
      if (!res.data) throw new Error("Update tag failed")
      const dto = res.data as TagDto
      const tag = toTag(dto)
      set((state) => ({ tags: state.tags.map((t) => (t.id === tag.id ? tag : t)) }))
    } catch (e: unknown) {
      toast({ title: "Не вдалося оновити тег", description: errorToMessage(e) })
    }
  },

  deleteTag: async (tagId) => {
    const token = getAccessToken()
    if (!token) return
    try {
      const res = await api.DELETE("/v1/tags/{tagId}", { params: { path: { tagId } } })
      ensureAuthOrThrow(res)
      if (!res.data) throw new Error("Delete tag failed")
      set((state) => ({
        tags: state.tags.filter((t) => t.id !== tagId),
        conversations: state.conversations.map((c) => ({ ...c, tagIds: c.tagIds.filter((t) => t !== tagId) })),
      }))
    } catch (e: unknown) {
      toast({ title: "Не вдалося видалити тег", description: errorToMessage(e) })
    }
  },

  createStatus: async (input) => {
    const token = getAccessToken()
    if (!token) return
    try {
      const res = await api.POST("/v1/statuses", { body: { ...input, sortOrder: 0 } })
      ensureAuthOrThrow(res)
      if (!res.data) throw new Error("Create status failed")
      const dto = res.data as StatusDto
      const status = toStatus(dto)
      set((state) => ({ statuses: [status, ...state.statuses] }))
    } catch (e: unknown) {
      toast({ title: "Не вдалося створити статус", description: errorToMessage(e) })
    }
  },

  updateStatus: async (statusId, input) => {
    const token = getAccessToken()
    if (!token) return
    try {
      const res = await api.PATCH("/v1/statuses/{statusId}", { params: { path: { statusId } }, body: input })
      ensureAuthOrThrow(res)
      if (!res.data) throw new Error("Update status failed")
      const dto = res.data as StatusDto
      const status = toStatus(dto)
      set((state) => ({ statuses: state.statuses.map((s) => (s.id === status.id ? status : s)) }))
    } catch (e: unknown) {
      toast({ title: "Не вдалося оновити статус", description: errorToMessage(e) })
    }
  },

  deleteStatus: async (statusId) => {
    const token = getAccessToken()
    if (!token) return
    try {
      const res = await api.DELETE("/v1/statuses/{statusId}", { params: { path: { statusId } } })
      ensureAuthOrThrow(res)
      if (!res.data) throw new Error("Delete status failed")
      set((state) => ({
        statuses: state.statuses.filter((s) => s.id !== statusId),
        conversations: state.conversations.map((c) => {
          if (c.statusId !== statusId) return c
          const next: Conversation = { ...c }
          delete next.statusId
          return next
        }),
      }))
    } catch (e: unknown) {
      toast({ title: "Не вдалося видалити статус", description: errorToMessage(e) })
    }
  },

  createTemplate: async (input) => {
    const token = getAccessToken()
    if (!token) return
    try {
      const categoryId = get().templateCategories.find((c) => c.name === input.category)?.id
      const res = await api.POST("/v1/templates", {
        body: {
          scope: input.scope === "global" ? "GLOBAL" : "CHANNEL",
          ...(input.scope === "prom" ? { channel: "PROM" } : input.scope === "olx" ? { channel: "OLX" } : {}),
          ...(categoryId ? { categoryId } : {}),
          title: input.title,
          content: input.text,
        },
      })
      ensureAuthOrThrow(res)
      if (!res.data) throw new Error("Create template failed")
      const dto = res.data as TemplateDto
      const categoriesById = new Map(get().templateCategories.map((c) => [c.id, c]))
      const tpl = toTemplate(dto, categoriesById)
      set((state) => ({ templates: [tpl, ...state.templates] }))
    } catch (e: unknown) {
      toast({ title: "Не вдалося створити шаблон", description: errorToMessage(e) })
    }
  },

  updateTemplate: async (templateId, input) => {
    const token = getAccessToken()
    if (!token) return
    try {
      const categoryId = get().templateCategories.find((c) => c.name === input.category)?.id
      const res = await api.PATCH("/v1/templates/{templateId}", {
        params: { path: { templateId } },
        body: { ...(categoryId ? { categoryId } : {}), title: input.title, content: input.text },
      })
      ensureAuthOrThrow(res)
      if (!res.data) throw new Error("Update template failed")
      const dto = res.data as TemplateDto
      const categoriesById = new Map(get().templateCategories.map((c) => [c.id, c]))
      const tpl = toTemplate(dto, categoriesById)
      set((state) => ({ templates: state.templates.map((t) => (t.id === tpl.id ? tpl : t)) }))
    } catch (e: unknown) {
      toast({ title: "Не вдалося оновити шаблон", description: errorToMessage(e) })
    }
  },

  deleteTemplate: async (templateId) => {
    const token = getAccessToken()
    if (!token) return
    try {
      const res = await api.DELETE("/v1/templates/{templateId}", { params: { path: { templateId } } })
      ensureAuthOrThrow(res)
      if (!res.data) throw new Error("Delete template failed")
      set((state) => ({ templates: state.templates.filter((t) => t.id !== templateId) }))
    } catch (e: unknown) {
      toast({ title: "Не вдалося видалити шаблон", description: errorToMessage(e) })
    }
  },

  toggleBulkSelect: (id) =>
    set((state) => ({
      bulkSelectedIds: state.bulkSelectedIds.includes(id)
        ? state.bulkSelectedIds.filter((i) => i !== id)
        : [...state.bulkSelectedIds, id],
    })),

  clearBulkSelection: () => set({ bulkSelectedIds: [] }),

  bulkArchive: () => {
    const ids = get().bulkSelectedIds.slice()
    set({ bulkSelectedIds: [] })
    ids.forEach((id) => get().archiveConversation(id))
  },

  bulkTag: (tagId) => {
    const ids = get().bulkSelectedIds.slice()
    set({ bulkSelectedIds: [] })
    ids.forEach((id) => get().addTagToConversation(id, tagId))
  },

  toggleBuyerSidebar: () => set((state) => ({ showBuyerSidebar: !state.showBuyerSidebar })),
}))
