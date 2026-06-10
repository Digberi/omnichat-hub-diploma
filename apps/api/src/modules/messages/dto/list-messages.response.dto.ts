import { ApiProperty } from "@nestjs/swagger"

import { MessageDto } from "./message.dto"

export class ListMessagesResponseDto {
  @ApiProperty({ type: [MessageDto] })
  items!: MessageDto[]

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null
}
