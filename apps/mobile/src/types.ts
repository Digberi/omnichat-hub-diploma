export type ChannelType = "olx" | "prom"
export type PaymentStatus = "pending" | "paid" | "partial" | "refunded"
export type ShippingStatus = "not_shipped" | "shipped" | "delivered" | "returned"

export interface Tag {
  id: string
  name: string
  color: string
  icon: string
}

export interface Status {
  id: string
  name: string
  color: string
  icon: string
}

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "error"
export type MessageDirection = "in" | "out"
export type AttachmentType = "image" | "video" | "document"

export interface Attachment {
  id: string
  type: AttachmentType
  name: string
  mimeType?: string
  sizeBytes?: number
}

export interface Message {
  id: string
  conversationId: string
  direction: MessageDirection
  text: string
  timestamp: string
  status: MessageStatus
  attachments?: Attachment[]
  replyTo?: string
}

export interface BuyerHistory {
  totalOrders: number
  totalSpent: number
  lastOrderDate?: string
  rating?: number
  previousProducts: string[]
  isRepeatBuyer: boolean
}

export interface Conversation {
  id: string
  buyerName: string
  buyerAvatar?: string
  buyerPhone?: string
  channelType: ChannelType
  accountId: string
  accountAlias?: string
  // Context (listing/product/order)
  contextType?: string
  contextTitle?: string
  contextPrice?: number
  contextCurrency?: string
  contextThumbUrl?: string
  contextExternalUrl?: string
  contextExternalId?: string
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
  needsReply: boolean
  isPinned: boolean
  isSnoozed: boolean
  snoozedUntil?: string
  isArchived: boolean
  statusId?: string
  tagIds: string[]
  // Seller features
  paymentStatus?: PaymentStatus
  shippingStatus?: ShippingStatus
  ttn?: string
  orderAmount?: number
  sellerNote?: string
  followUpAt?: string
  buyerHistory?: BuyerHistory
  isOnline?: boolean
  lastSeen?: string
}

export type TemplateScope = "global" | "olx" | "prom"
export type TemplateCategory = "payment" | "delivery" | "upsell" | "issues" | "custom"

export interface Template {
  id: string
  title: string
  text: string
  scope: TemplateScope
  category: TemplateCategory
  categoryId?: string
  categoryName?: string
}

export interface QuickShortcut {
  id: string
  label: string
  text: string
  icon: string
}
