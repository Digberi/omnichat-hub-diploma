import type { MessageAttachmentDto, MessageDto } from "./dto/message.dto"

export function toMessageAttachmentDto(row: any): MessageAttachmentDto {
  return {
    id: row.id,
    kind: row.kind,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    originalName: row.originalName ?? null,
    // `previewUrl` is injected by MessagesService.enrichPreviewUrls
    // for IMAGE/VIDEO rows before the controller calls toMessageDto.
    // Falls back to null when the service hasn't enriched (e.g.
    // background paths or DOCUMENT kinds that don't render inline).
    previewUrl: row.previewUrl ?? null,
  }
}

export function toMessageDto(row: any): MessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    direction: row.direction,
    text: row.text ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    sentAt: row.sentAt ? (row.sentAt instanceof Date ? row.sentAt.toISOString() : String(row.sentAt)) : null,
    deliveryStatus: row.deliveryStatus,
    clientMessageId: row.clientMessageId ?? null,
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    metadata: row.metadata ?? null,
    attachments: Array.isArray(row.attachments) ? row.attachments.map(toMessageAttachmentDto) : [],
  }
}

