import type { ConversationDto } from "./dto/conversation.dto"
import type { ConversationDetailsDto } from "./dto/conversation-details.dto"

export function toConversationDto(row: any): ConversationDto {
  const lastMessage = Array.isArray(row.messages) && row.messages.length > 0 ? row.messages[0] : null
  const lastMessageTextRaw: string | null =
    typeof lastMessage?.text === "string" && lastMessage.text.length > 0 ? lastMessage.text : null

  const attachmentCount: number =
    typeof lastMessage?._count?.attachments === "number" ? lastMessage._count.attachments : 0

  let lastMessageText: string | null = lastMessageTextRaw
  if (!lastMessageText && attachmentCount > 0) {
    if (attachmentCount === 1) {
      const first = Array.isArray(lastMessage?.attachments) && lastMessage.attachments.length > 0 ? lastMessage.attachments[0] : null
      const kind = first?.kind
      const emoji = kind === "IMAGE" ? "🖼️" : kind === "VIDEO" ? "🎬" : "📎"
      const name =
        typeof first?.originalName === "string" && first.originalName.length > 0
          ? first.originalName
          : kind === "IMAGE"
            ? "Фото"
            : kind === "VIDEO"
              ? "Відео"
              : "Файл"
      lastMessageText = `${emoji} ${name}`
    } else {
      lastMessageText = `📎 ${attachmentCount} файлів`
    }
  }

  return {
    id: row.id,
    channelAccountId: row.channelAccountId,
    channelAccountAlias: row.channelAccount?.alias ?? null,
    buyerDisplayName: row.buyerDisplayName,
    buyerAvatarUrl: row.buyerAvatarUrl ?? null,
    buyerPhone: row.buyerPhone ?? null,
    channel: row.channel,
    statusId: row.statusId ?? null,
    tagIds: Array.isArray(row.tags) ? row.tags.map((t: any) => t.tagId) : [],
    paymentStatus: row.paymentStatus ?? null,
    shippingStatus: row.shippingStatus ?? null,
    ttn: row.ttn ?? null,
    orderAmount: row.orderAmount ?? null,
    sellerNote: row.sellerNote ?? null,
    followUpAt: row.followUpAt ? row.followUpAt.toISOString() : null,
    buyerHistory: row.buyerHistoryJson ?? null,
    isOnline: typeof row.buyerIsOnline === "boolean" ? row.buyerIsOnline : null,
    lastSeen: row.buyerLastSeenAt ? row.buyerLastSeenAt.toISOString() : null,
    needsReply: row.needsReply,
    isArchived: row.isArchived,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    snoozedUntil: row.snoozedUntil ? row.snoozedUntil.toISOString() : null,
    isPinnedInAll: row.isPinnedInAll,
    pinnedAt: row.pinnedAt ? row.pinnedAt.toISOString() : null,
    lastActivityAt: row.lastActivityAt ? row.lastActivityAt.toISOString() : null,
    lastIncomingAt: row.lastIncomingAt ? row.lastIncomingAt.toISOString() : null,
    lastSellerReplyAt: row.lastSellerReplyAt ? row.lastSellerReplyAt.toISOString() : null,
    lastMessageText,
    lastMessageAt:
      lastMessage?.sentAt
        ? lastMessage.sentAt.toISOString()
        : lastMessage?.createdAt
          ? lastMessage.createdAt.toISOString()
          : null,
    lastMessageDirection: lastMessage?.direction ?? null,
  }
}

export function toConversationDetailsDto(row: any): ConversationDetailsDto {
  return {
    ...toConversationDto(row),
    workspaceId: row.workspaceId,
    channelAccountId: row.channelAccountId,
    externalConversationId: row.externalConversationId ?? null,
    externalBuyerId: row.externalBuyerId ?? null,
    contextType: row.contextType ?? null,
    contextTitle: row.contextTitle ?? null,
    contextPrice: row.contextPrice ?? null,
    contextCurrency: row.contextCurrency ?? null,
    contextThumbUrl: row.contextThumbUrl ?? null,
    contextExternalUrl: row.contextExternalUrl ?? null,
    contextExternalId: row.contextExternalId ?? null,
    contextStatusId: row.contextStatusId ?? null,
    contextStatusName: row.contextStatusName ?? null,
  }
}
