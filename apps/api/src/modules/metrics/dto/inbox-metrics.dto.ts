import { ApiProperty } from "@nestjs/swagger"

export class InboxMetricsDto {
  @ApiProperty({ type: Number, nullable: true, description: "Average response time in minutes (approx)." })
  avgResponseMin!: number | null

  @ApiProperty({ type: [Number], description: "Message counts grouped by hour-of-day (0..23) for last 24h." })
  hourlyActivity!: number[]
}

