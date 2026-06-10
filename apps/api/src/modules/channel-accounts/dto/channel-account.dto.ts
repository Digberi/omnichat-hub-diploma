import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { Channel, ChannelAuthType } from "@omnichat/contracts"

export class ChannelAccountDto {
  @ApiProperty()
  id!: string

  @ApiProperty({ enum: Channel })
  channel!: Channel

  @ApiProperty()
  alias!: string

  @ApiPropertyOptional({ type: String, nullable: true })
  externalAccountId?: string | null

  @ApiProperty({ enum: ChannelAuthType })
  authType!: ChannelAuthType

  @ApiProperty()
  isEnabled!: boolean

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  lastSyncAt?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  lastError?: string | null

  @ApiProperty({ format: "date-time" })
  createdAt!: string

  @ApiProperty({ format: "date-time" })
  updatedAt!: string
}

