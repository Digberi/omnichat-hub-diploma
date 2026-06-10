import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"

export class WorkspaceSettingsDto {
  @ApiProperty()
  workspaceId!: string

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string

  @ApiProperty({ type: String, format: "date-time" })
  updatedAt!: string

  @ApiProperty({ minimum: 1, maximum: 365 })
  autoArchiveDays!: number

  @ApiProperty()
  openContextExternalDirect!: boolean

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

  @ApiPropertyOptional({ type: "object", additionalProperties: true, nullable: true })
  notificationPrefsJson?: Record<string, unknown> | null
}

