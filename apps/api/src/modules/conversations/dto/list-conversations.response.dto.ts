import { ApiProperty } from "@nestjs/swagger"

import { ConversationDto } from "./conversation.dto"

export class ListConversationsResponseDto {
  @ApiProperty({ type: [ConversationDto] })
  pinned!: ConversationDto[]

  @ApiProperty({ type: [ConversationDto] })
  items!: ConversationDto[]

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null
}
