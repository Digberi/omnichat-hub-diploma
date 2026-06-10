import { ApiProperty } from "@nestjs/swagger"

class StorageOperationMetricsDto {
  @ApiProperty()
  total!: number

  @ApiProperty()
  failed!: number

  @ApiProperty()
  retried!: number

  @ApiProperty({ type: Number, nullable: true })
  avgDurationMs!: number | null

  @ApiProperty({ type: String, nullable: true })
  lastErrorAt!: string | null

  @ApiProperty({ type: String, nullable: true })
  lastErrorMessage!: string | null

  @ApiProperty({ type: String, nullable: true })
  lastSuccessAt!: string | null

  @ApiProperty({ type: String, nullable: true })
  lastFailureAt!: string | null
}

export class StorageMetricsDto {
  @ApiProperty()
  bucket!: string

  @ApiProperty()
  endpoint!: string

  @ApiProperty({ type: String, nullable: true })
  lastPingAt!: string | null

  @ApiProperty({ type: StorageOperationMetricsDto, isArray: false, required: false })
  operations!: Record<string, StorageOperationMetricsDto>
}
