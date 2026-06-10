import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"

import { ConversationDto } from "./conversation.dto"

export class ConversationDetailsDto extends ConversationDto {
  @ApiProperty()
  workspaceId!: string

  @ApiPropertyOptional({ type: String, nullable: true })
  externalConversationId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  externalBuyerId?: string | null

  @ApiPropertyOptional({ enum: ["LISTING", "PRODUCT", "ORDER"], nullable: true })
  contextType?: "LISTING" | "PRODUCT" | "ORDER" | null

  @ApiPropertyOptional({ type: String, nullable: true })
  contextTitle?: string | null

  @ApiPropertyOptional({ type: Number, nullable: true })
  contextPrice?: number | null

  @ApiPropertyOptional({ type: String, nullable: true })
  contextCurrency?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  contextThumbUrl?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  contextExternalUrl?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  contextExternalId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, description: "Channel-side order/listing status id (e.g. Rozetka order_status id)" })
  contextStatusId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, description: "Human-readable label for contextStatusId, resolved via /order-statuses/search with a built-in 1–50 fallback" })
  contextStatusName?: string | null
}
