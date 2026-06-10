import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsBoolean, IsOptional } from "class-validator"

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  pushNewMessageEnabled?: boolean

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  pushSendErrorEnabled?: boolean

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  pushSnoozeEnabled?: boolean

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  pushSyncErrorEnabled?: boolean

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  pushExpiryEnabled?: boolean
}

