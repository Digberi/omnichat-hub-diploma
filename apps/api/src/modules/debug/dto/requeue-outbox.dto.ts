import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsArray, IsIn, IsInt, IsOptional, Max, Min } from "class-validator"

const OUTBOX_STATUSES = ["PENDING", "PROCESSING", "PROCESSED", "FAILED"] as const

export class RequeueOutboxDto {
  @ApiPropertyOptional({
    type: [String],
    enum: OUTBOX_STATUSES,
    description: "Statuses to include for requeue; PROCESSING is included only when stale by maxAgeSec.",
  })
  @IsOptional()
  @IsArray()
  @IsIn(OUTBOX_STATUSES, { each: true })
  statuses?: Array<(typeof OUTBOX_STATUSES)[number]>

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number

  @ApiPropertyOptional({ minimum: 30, maximum: 86_400, default: 300, description: "Stale PROCESSING threshold in seconds." })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(86_400)
  maxAgeSec?: number
}

