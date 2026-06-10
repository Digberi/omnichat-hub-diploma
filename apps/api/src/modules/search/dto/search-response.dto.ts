import { ApiProperty } from "@nestjs/swagger"

export class SearchConversationHitDto {
  @ApiProperty()
  id!: string

  @ApiProperty()
  buyerDisplayName!: string

  @ApiProperty({ type: String, nullable: true })
  contextTitle!: string | null

  @ApiProperty({ type: String, nullable: true })
  lastActivityAt!: string | null
}

export class SearchMessageHitDto {
  @ApiProperty()
  id!: string

  @ApiProperty()
  conversationId!: string

  @ApiProperty({ type: String, nullable: true })
  text!: string | null

  @ApiProperty()
  createdAt!: string
}

export class SearchResponseDto {
  @ApiProperty({ type: SearchConversationHitDto, isArray: true })
  conversations!: SearchConversationHitDto[]

  @ApiProperty({ type: SearchMessageHitDto, isArray: true })
  messages!: SearchMessageHitDto[]
}
