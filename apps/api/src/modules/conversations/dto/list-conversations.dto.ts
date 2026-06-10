import { ApiPropertyOptional } from "@nestjs/swagger"
import { Type } from "class-transformer"
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator"
import { FolderScope } from "@omnichat/contracts"

export enum ChannelFilter {
  OLX = "OLX",
  PROM = "PROM",
}

export class ListConversationsQueryDto {
  @ApiPropertyOptional({ enum: FolderScope })
  @IsEnum(FolderScope)
  @IsOptional()
  folder?: FolderScope

  @ApiPropertyOptional({ enum: ChannelFilter, description: "Only used when folder=CHANNEL" })
  @IsEnum(ChannelFilter)
  @IsOptional()
  channel?: ChannelFilter

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number

  @ApiPropertyOptional({ description: "Opaque cursor from previous response" })
  @IsString()
  @IsOptional()
  cursor?: string
}

