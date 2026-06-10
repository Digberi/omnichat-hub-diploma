import { create } from "zustand"

import type { components } from "@omnichat/api-client"

import { api } from "../lib/api"
import { env } from "../lib/env"
import { clearTokens, getAccessToken } from "../lib/tokens"
import type {
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
} from "../types"

type ConversationDto = components["schemas"]["ConversationDto"]
type ConversationDetailsDto = components["schemas"]["ConversationDetailsDto"]
type ListConversationsResponseDto = components["schemas"]["ListConversationsResponseDto"]
type MessageDto = components["schemas"]["MessageDto"]
type ListMessagesResponseDto = components["schemas"]["ListMessagesResponseDto"]
type AroundMessagesResponseDto = components["schemas"]["AroundMessagesResponseDto"]
type TagDto = components["schemas"]["TagDto"]
type StatusDto = components["schemas"]["StatusDto"]
type TemplateDto = components["schemas"]["TemplateDto"]
type TemplateCategoryDto = components["schemas"]["TemplateCategoryDto"]
type WorkspaceSettingsDto = components["schemas"]["WorkspaceSettingsDto"]
type InboxMetricsDto = components["schemas"]["InboxMetricsDto"]

export const defaultShortcuts: QuickShortcut[] = [
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
  void clearTokens()
  throw new Error("Unauthorized")
}

function toChannelType(input: unknown): Conversation["channelType"] {
  if (input === "PROM") return "prom"
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

function toAttachment(dto: any): Attachment {
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
  }
}

function toMessage(dto: MessageDto): Message {
  const ts = dto.sentAt ?? dto.createdAt
  const attachments = Array.isArray(dto.attachments) ? dto.attachments.map(toAttachment) : []
  return {
    id: dto.id,
    conversationId: dto.conversationId,
    direction: dto.direction === "OUT" ? "out" : "in",
    text: dto.text ?? "",
    timestamp: ts,
    status: toMessageStatus(dto.deliveryStatus),
    ...(attachments.length > 0 ? { attachments } : {}),
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
    dto.scope === "GLOBAL" ? "global" : dto.channel === "PROM" ? "prom" : "olx"

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
    scope,
    category: categoryKey,
    ...(dto.categoryId != null ? { categoryId: dto.categoryId } : {}),
    ...(categoryKey === "custom" && categoryName !== "custom" ? { categoryName } : {}),
  }
}

function newClientMessageId(): string {
  return `m_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function updateConversationInList(list: Conversation[], next: Conversation): Conversation[] {
  const idx = list.findIndex((c) => c.id === next.id)
  if (idx === -1) return [next, ...list]
  const copy = list.slice()
  copy[idx] = { ...copy[idx], ...next }
  return copy
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
  if (typeof patch.deliveryStatus === "string") next.status = toMessageStatus(patch.deliveryStatus)

  if (Array.isArray(patch.attachments)) {
    const atts = patch.attachments.map(toAttachment).filter((a) => a.id.length > 0)
    if (atts.length > 0) next.attachments = atts
    else delete next.attachments
  }

  return next
}

export type InboxTab = "all" | "unread" | "olx" | "prom" | "snoozed" | "archive"

export interface AppState {
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
  settings: WorkspaceSettingsDto | null
  inboxMetrics: InboxMetricsDto | null

  selectedConversationId: string | null
  searchQuery: string

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
  archiveConversation: (id: string, confirmUnpin?: boolean) => void
  unarchiveConversation: (id: string) => void

  setConversationStatus: (conversationId: string, statusId: string | null) => void
  setConversationTags: (conversationId: string, tagIds: string[]) => void

  sendMessage: (conversationId: string, text: string, replyTo?: string) => void
  sendAttachment: (
    conversationId: string,
    file: { uri: string; name: string; mimeType?: string; sizeBytes?: number },
  ) => void
  createAttachmentShortLink: (attachmentId: string) => Promise<string>
  markAsRead: (conversationId: string) => void

  updateSettings: (patch: Partial<WorkspaceSettingsDto>) => void

  setSellerNote: (conversationId: string, note: string) => void
  setTtn: (conversationId: string, ttn: string) => void
  setPaymentStatus: (conversationId: string, status: PaymentStatus) => void
  setShippingStatus: (conversationId: string, status: ShippingStatus) => void
  setFollowUp: (conversationId: string, at: string | undefined) => void

  createTag: (input: { name: string; color: string; icon: string }) => Promise<void>
  updateTag: (tagId: string, input: { name: string; color: string; icon: string }) => Promise<void>
  deleteTag: (tagId: string) => Promise<void>

  createStatus: (input: { name: string; color: string; icon: string }) => Promise<void>
  updateStatus: (statusId: string, input: { name: string; color: string; icon: string }) => Promise<void>
  deleteStatus: (statusId: string) => Promise<void>
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
  settings: null,
  inboxMetrics: null,

  selectedConversationId: null,
  searchQuery: "",

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
        await clearTokens()
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

      const categories = categoriesRes.data as TemplateCategoryDto[]
      const categoriesById = new Map(categories.map((c) => [c.id, c] as const))
      const templates = (templatesRes.data as TemplateDto[]).map((t) => toTemplate(t, categoriesById))

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
        templateCategories: categories,
        settings: settingsRes.data as WorkspaceSettingsDto,
        bootstrapped: true,
      })

      get().refreshInboxMetrics()
    } catch (e: unknown) {
      set({ bootstrapError: errorToMessage(e), bootstrapped: false })
    } finally {
      set({ bootstrapping: false })
    }
  },

  refreshInbox: async () => {
    const token = getAccessToken()
    if (!token) return
    const [convAllRes, convArchivedRes] = await Promise.all([
      api.GET("/v1/conversations", { params: { query: { folder: "ALL", limit: 100 } } }),
      api.GET("/v1/conversations", { params: { query: { folder: "ARCHIVED", limit: 100 } } }),
    ])
    if (is401(convAllRes) || is401(convArchivedRes)) {
      await clearTokens()
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
      // keep cached messages, tags/status/templates/settings as-is
      messages: state.messages,
      tags: state.tags,
      statuses: state.statuses,
      templates: state.templates,
      templateCategories: state.templateCategories,
      shortcuts: state.shortcuts,
      settings: state.settings,
      inboxMetrics: state.inboxMetrics,
      selectedConversationId: state.selectedConversationId,
      searchQuery: state.searchQuery,
      bootstrapped: state.bootstrapped,
      bootstrapping: state.bootstrapping,
      bootstrapError: state.bootstrapError,
    }))

    get().refreshInboxMetrics()
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
        // Non-critical.
      }
    })()
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

      const prevMsgs = state.messages[conversationId] ?? []
      const nextMsgs = prevMsgs.some((m) => m.id === msg.id) ? prevMsgs : [...prevMsgs, msg]

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
        conversations: nextConv ? updateConversationInList(state.conversations, nextConv) : state.conversations,
      }
    }),

  selectConversation: (id) => {
    set({ selectedConversationId: id })
    if (!id) return

    const token = getAccessToken()
    if (!token) return

    void (async () => {
      try {
        const [detailsRes, messagesRes] = await Promise.all([
          api.GET("/v1/conversations/{conversationId}", { params: { path: { conversationId: id } } }),
          api.GET("/v1/conversations/{conversationId}/messages", {
            params: { path: { conversationId: id }, query: { limit: 200 } },
          }),
        ])

        if (is401(detailsRes) || is401(messagesRes)) {
          await clearTokens()
          return
        }
        if (!detailsRes.data || !messagesRes.data) throw new Error("Failed to load conversation")

        const details = detailsRes.data as ConversationDetailsDto
        const items = (messagesRes.data as ListMessagesResponseDto).items
        const mapped = Array.isArray(items) ? items.map(toMessage) : []

        set((state) => {
          const existing = state.conversations.find((c) => c.id === id) ?? toConversation(details)
          const merged = mergeConversationDetails(existing, details)
          return {
            conversations: updateConversationInList(state.conversations, merged),
            messages: { ...state.messages, [id]: mapped },
          }
        })
      } catch {
        // Non-critical in UI: show via screen error state when needed.
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
          await clearTokens()
          return
        }
        if (!detailsRes.data || !aroundRes.data) throw new Error("Failed to load around messages")

        const details = detailsRes.data as ConversationDetailsDto
        const items = (aroundRes.data as AroundMessagesResponseDto).items
        const mapped = Array.isArray(items) ? items.map(toMessage) : []

        set((state) => {
          const existing = state.conversations.find((c) => c.id === conversationId) ?? toConversation(details)
          const merged = mergeConversationDetails(existing, details)
          return {
            conversations: updateConversationInList(state.conversations, merged),
            messages: { ...state.messages, [conversationId]: mapped },
          }
        })
      } catch {
        // ignore
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
      } catch {
        // ignore
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
      } catch {
        // ignore
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
      } catch {
        // ignore
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
      } catch {
        // ignore
      }
    })()
  },

  archiveConversation: (id, confirmUnpin) => {
    const token = getAccessToken()
    if (!token) return
    void (async () => {
      try {
        const body = confirmUnpin ? { confirmUnpin: true } : {}
        const res = await api.POST("/v1/conversations/{conversationId}/archive", { params: { path: { conversationId: id } }, body })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Archive failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch {
        // ignore
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
      } catch {
        // ignore
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
          body: { statusId },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Set status failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch {
        // ignore
      }
    })()
  },

  setConversationTags: (conversationId, tagIds) => {
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
      } catch {
        // ignore
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
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: (state.messages[conversationId] ?? []).map((m) => (m.id === optimistic.id ? sent : m)),
          },
        }))
      } catch {
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: (state.messages[conversationId] ?? []).map((m) =>
              m.id === optimistic.id ? { ...m, status: "error" } : m,
            ),
          },
        }))
      }
    })()
  },

  sendAttachment: (conversationId, file) => {
    const token = getAccessToken()
    if (!token) return

    const now = new Date().toISOString()
    const clientMessageId = `mob_${Date.now()}_${Math.random().toString(16).slice(2)}`

    const mimeType = file.mimeType ?? "application/octet-stream"
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
      attachments: [
        {
          id: `optimistic-att-${clientMessageId}`,
          type: kind,
          name: file.name,
          mimeType,
          ...(typeof file.sizeBytes === "number" ? { sizeBytes: file.sizeBytes } : {}),
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
        form.append("file", { uri: file.uri, name: file.name, type: mimeType } as any)

        const res = await api.POST("/v1/conversations/{conversationId}/messages/attachment", {
          params: { path: { conversationId } },
          body: form as any,
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Send attachment failed")

        const sent = toMessage(res.data as MessageDto)
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: (state.messages[conversationId] ?? []).map((m) => (m.id === optimistic.id ? sent : m)),
          },
        }))
      } catch (e: unknown) {
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: (state.messages[conversationId] ?? []).map((m) =>
              m.id === optimistic.id ? { ...m, status: "error" } : m,
            ),
          },
        }))
      }
    })()
  },

  createAttachmentShortLink: async (attachmentId) => {
    const token = getAccessToken()
    if (!token) throw new Error("Unauthorized")

    const res = await api.POST("/v1/attachments/{attachmentId}/short-link", { params: { path: { attachmentId } } })
    ensureAuthOrThrow(res)
    if (!res.data) throw new Error("Create short link failed")

    const url = String((res.data as any)?.url ?? "")
    if (!url) throw new Error("Short link url missing")

    if (url.startsWith("http://") || url.startsWith("https://")) return url
    const base = env.apiBaseUrl.replace(/\/$/, "")
    const path = url.startsWith("/") ? url : `/${url}`
    return `${base}${path}`
  },

  markAsRead: (conversationId) =>
    // Product rule: opening/reading must NOT clear needsReply/unread.
    set((state) => state),

  updateSettings: (patch) => {
    set((state) => ({ settings: state.settings ? ({ ...state.settings, ...patch } as WorkspaceSettingsDto) : state.settings }))
    const token = getAccessToken()
    if (!token) return
    void (async () => {
      try {
        const current = get().settings
        if (!current) return
        const res = await api.PATCH("/v1/settings", { body: patch })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Save settings failed")
        set({ settings: res.data as WorkspaceSettingsDto })
      } catch {
        // ignore
      }
    })()
  },

  setSellerNote: (conversationId, note) => {
    const token = getAccessToken()
    if (!token) return

    get().applyConversationPatch(conversationId, { sellerNote: note })

    void (async () => {
      try {
        const res = await api.PATCH("/v1/conversations/{conversationId}/meta", {
          params: { path: { conversationId } },
          body: { sellerNote: note },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Update failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch {
        // ignore
      }
    })()
  },

  setTtn: (conversationId, ttn) => {
    const token = getAccessToken()
    if (!token) return

    get().applyConversationPatch(conversationId, { ttn, shippingStatus: "shipped" })

    void (async () => {
      try {
        const res = await api.PATCH("/v1/conversations/{conversationId}/meta", {
          params: { path: { conversationId } },
          body: { ttn, shippingStatus: "shipped" },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Update failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch {
        // ignore
      }
    })()
  },

  setPaymentStatus: (conversationId, status) => {
    const token = getAccessToken()
    if (!token) return

    get().applyConversationPatch(conversationId, { paymentStatus: status })

    void (async () => {
      try {
        const res = await api.PATCH("/v1/conversations/{conversationId}/meta", {
          params: { path: { conversationId } },
          body: { paymentStatus: status },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Update failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch {
        // ignore
      }
    })()
  },

  setShippingStatus: (conversationId, status) => {
    const token = getAccessToken()
    if (!token) return

    get().applyConversationPatch(conversationId, { shippingStatus: status })

    void (async () => {
      try {
        const res = await api.PATCH("/v1/conversations/{conversationId}/meta", {
          params: { path: { conversationId } },
          body: { shippingStatus: status },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Update failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch {
        // ignore
      }
    })()
  },

  setFollowUp: (conversationId, at) => {
    const token = getAccessToken()
    if (!token) return

    get().applyConversationPatch(conversationId, { followUpAt: at ?? null })

    void (async () => {
      try {
        const res = await api.PATCH("/v1/conversations/{conversationId}/meta", {
          params: { path: { conversationId } },
          body: { followUpAt: at ?? null },
        })
        ensureAuthOrThrow(res)
        if (!res.data) throw new Error("Update failed")
        const dto = res.data as ConversationDto
        set((state) => ({ conversations: updateConversationInList(state.conversations, toConversation(dto)) }))
      } catch {
        // ignore
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
    } catch {
      // ignore
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
    } catch {
      // ignore
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
    } catch {
      // ignore
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
    } catch {
      // ignore
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
    } catch {
      // ignore
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
    } catch {
      // ignore
    }
  },
}))
