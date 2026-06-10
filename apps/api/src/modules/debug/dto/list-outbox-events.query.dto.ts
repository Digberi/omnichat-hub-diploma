import { Type } from "class-transformer"
import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator"

const OUTBOX_STATUSES = ["PENDING", "PROCESSING", "PROCESSED", "FAILED"] as const

export class ListOutboxEventsQueryDto {
  @ApiPropertyOptional({ enum: OUTBOX_STATUSES })
  @IsOptional()
  @IsIn(OUTBOX_STATUSES)
  status?: (typeof OUTBOX_STATUSES)[number]

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number
}
