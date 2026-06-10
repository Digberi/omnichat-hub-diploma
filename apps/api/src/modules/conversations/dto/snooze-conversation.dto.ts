import { ApiProperty } from "@nestjs/swagger"
import { IsISO8601 } from "class-validator"

export class SnoozeConversationDto {
  @ApiProperty({ description: "ISO datetime until which PUSH notifications are suppressed" })
  @IsISO8601()
  until!: string
}

