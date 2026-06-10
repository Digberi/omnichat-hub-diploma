import { ApiPropertyOptional } from "@nestjs/swagger"
import { Type } from "class-transformer"
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator"

export class ListMessagesQueryDto {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number

  @ApiPropertyOptional({ description: "Opaque cursor from previous response" })
  @IsString()
  @IsOptional()
  cursor?: string
}

