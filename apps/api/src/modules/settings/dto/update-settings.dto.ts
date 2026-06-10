import { ApiPropertyOptional } from "@nestjs/swagger"
import { Type } from "class-transformer"
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator"

export class UpdateSettingsDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  autoArchiveDays?: number

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  openContextExternalDirect?: boolean

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

