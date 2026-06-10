import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"

export class NotificationPreferencesDto {
  @ApiProperty()
  pushNewMessageEnabled!: boolean

  @ApiProperty()
  pushSendErrorEnabled!: boolean

  @ApiProperty()
  pushSnoozeEnabled!: boolean

  @ApiProperty()
  pushSyncErrorEnabled!: boolean

  @ApiProperty()
  pushExpiryEnabled!: boolean

  @ApiPropertyOptional({ type: Object, nullable: true })
  notificationPrefsJson?: unknown | null

  @ApiProperty({ format: "date-time" })
  updatedAt!: string
}

