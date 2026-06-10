import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"

export class MessageAttachmentDto {
  @ApiProperty()
  id!: string

  @ApiProperty({ enum: ["IMAGE", "VIDEO", "DOCUMENT"] })
  kind!: "IMAGE" | "VIDEO" | "DOCUMENT"

  @ApiProperty()
  mimeType!: string

  @ApiProperty()
  sizeBytes!: number

  @ApiPropertyOptional({ type: String, nullable: true })
  originalName?: string | null

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "Presigned download URL valid for ~7 days. Populated for IMAGE / VIDEO kinds so the inbox can render media inline without an extra round-trip; null for DOCUMENT (operator clicks 'Відкрити' to mint a short-link).",
  })
  previewUrl?: string | null
}

export class MessageDto {
  @ApiProperty()
  id!: string

  @ApiProperty()
  conversationId!: string

  @ApiProperty({ enum: ["IN", "OUT"] })
  direction!: "IN" | "OUT"

  @ApiPropertyOptional({ type: String, nullable: true })
  text?: string | null

  @ApiProperty({ format: "date-time" })
  createdAt!: string

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  sentAt?: string | null

  @ApiProperty({ enum: ["SENDING", "SENT", "DELIVERED", "READ", "FAILED"] })
  deliveryStatus!: "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED"

  @ApiPropertyOptional({ type: String, nullable: true })
  clientMessageId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  errorCode?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  errorMessage?: string | null

  @ApiPropertyOptional({ type: [MessageAttachmentDto] })
  attachments?: MessageAttachmentDto[]

  @ApiPropertyOptional({
    // `additionalProperties: true` keeps the OpenAPI shape open-ended so the
    // generated client surfaces metadata as `{ [k: string]: unknown }` instead
    // of `Record<string, never>` (which forbids all keys). The structured
    // payload is discriminated by metadata.kind on the consumer side; the
    // server doesn't validate it and surfaces whatever the worker wrote.
    type: "object",
    additionalProperties: true,
    nullable: true,
    description:
      "Structured payload for synthesized event messages (e.g. Rozetka order events). Schema is discriminated by metadata.kind on the consumer side. May be null for ordinary chat messages.",
  })
  metadata?: Record<string, unknown> | null
}
