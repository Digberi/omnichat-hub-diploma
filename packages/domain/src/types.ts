export type Timestamp = string

export type FolderId = "ALL" | "UNREAD" | "CHANNEL" | "SNOOZED" | "ARCHIVED"

export type ConversationState = {
  id: string
  needsReply: boolean
  isArchived: boolean
  archivedAt?: Timestamp | null
  snoozedUntil?: Timestamp | null
  isPinnedInAll: boolean
  pinnedAt?: Timestamp | null
  lastActivityAt?: Timestamp | null
  lastIncomingAt?: Timestamp | null
  lastSellerReplyAt?: Timestamp | null
  statusId?: string | null
  tagIds: string[]
  autoArchiveDays?: number | null
}

export type MessageDirection = "IN" | "OUT"

export type MessageCore = {
  id: string
  conversationId: string
  direction: MessageDirection
  text?: string | null
  sentAt?: Timestamp | null
  externalMessageId?: string | null
  clientMessageId?: string | null
}

