import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"

export class ConversationDto {
  @ApiProperty()
  id!: string

  @ApiProperty()
  channelAccountId!: string

  @ApiPropertyOptional({ type: String, nullable: true })
  channelAccountAlias?: string | null

  @ApiProperty()
  buyerDisplayName!: string

  @ApiPropertyOptional({ type: String, nullable: true })
  buyerAvatarUrl?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  buyerPhone?: string | null

  @ApiProperty({ enum: ["OLX", "PROM", "ROZETKA"] })
  channel!: "OLX" | "PROM" | "ROZETKA"

  @ApiPropertyOptional({ type: String, nullable: true })
  statusId?: string | null

  @ApiProperty({ type: [String] })
  tagIds!: string[]

  @ApiPropertyOptional({ enum: ["pending", "paid", "partial", "refunded"], nullable: true })
  paymentStatus?: "pending" | "paid" | "partial" | "refunded" | null

  @ApiPropertyOptional({ enum: ["not_shipped", "shipped", "delivered", "returned"], nullable: true })
  shippingStatus?: "not_shipped" | "shipped" | "delivered" | "returned" | null

  @ApiPropertyOptional({ type: String, nullable: true })
  ttn?: string | null

  @ApiPropertyOptional({ type: Number, nullable: true })
  orderAmount?: number | null

  @ApiPropertyOptional({ type: String, nullable: true })
  sellerNote?: string | null

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  followUpAt?: string | null

  @ApiPropertyOptional({ type: Object, nullable: true })
  buyerHistory?: unknown | null

  @ApiPropertyOptional({ type: Boolean, nullable: true })
  isOnline?: boolean | null

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  lastSeen?: string | null

  @ApiProperty()
  needsReply!: boolean

  @ApiProperty()
  isArchived!: boolean

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  archivedAt?: string | null

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  snoozedUntil?: string | null

  @ApiProperty()
  isPinnedInAll!: boolean

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  pinnedAt?: string | null

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  lastActivityAt?: string | null

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  lastIncomingAt?: string | null

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  lastSellerReplyAt?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  lastMessageText?: string | null

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  lastMessageAt?: string | null

  @ApiPropertyOptional({ enum: ["IN", "OUT"], nullable: true })
  lastMessageDirection?: "IN" | "OUT" | null
}
