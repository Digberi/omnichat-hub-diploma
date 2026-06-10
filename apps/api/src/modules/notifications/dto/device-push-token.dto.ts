import { ApiProperty } from "@nestjs/swagger"
import { DevicePlatform } from "@omnichat/contracts"

export class DevicePushTokenDto {
  @ApiProperty()
  id!: string

  @ApiProperty({ enum: DevicePlatform })
  platform!: DevicePlatform

  @ApiProperty({ description: "Opaque push token (for debugging; client already knows this value)." })
  token!: string

  @ApiProperty()
  isEnabled!: boolean

  @ApiProperty({ format: "date-time" })
  updatedAt!: string
}

