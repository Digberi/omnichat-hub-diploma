import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { Type } from "class-transformer"
import { IsInt, IsOptional, Max, Min } from "class-validator"

import { MessageDto } from "./message.dto"

export class AroundMessagesQueryDto {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number
}

export class AroundMessagesResponseDto {
  @ApiProperty({ type: [MessageDto] })
  items!: MessageDto[]

  @ApiProperty()
  anchorMessageId!: string
}

