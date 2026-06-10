import { ApiProperty } from "@nestjs/swagger"

class StorageOperationHealthDto {
  @ApiProperty()
  operation!: string

  @ApiProperty()
  total!: number

  @ApiProperty()
  failures!: number

  @ApiProperty({ description: "Failure percent in the observed interval (0-100)." })
  failureRatePct!: number

  @ApiProperty({ type: Number, nullable: true, description: "Average operation duration in ms." })
  avgDurationMs!: number | null
}

export class StorageHealthDto {
  @ApiProperty({ enum: ["ok", "degraded", "critical"] })
  status!: "ok" | "degraded" | "critical"

  @ApiProperty({ description: "Human-readable reasons for non-ok status." })
  reasons!: string[]

  @ApiProperty({ type: [StorageOperationHealthDto] })
  operations!: StorageOperationHealthDto[]

  @ApiProperty({ type: String, nullable: true, description: "Last storage ping ISO timestamp." })
  lastPingAt!: string | null
}
