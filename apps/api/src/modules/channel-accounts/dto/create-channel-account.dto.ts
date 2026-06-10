import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator"
import { Channel } from "@omnichat/contracts"

export class CreateChannelAccountDto {
  @ApiProperty({ enum: Channel })
  @IsEnum(Channel)
  channel!: Channel

  @ApiProperty({ description: "Display alias for this channel account" })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  alias!: string

  @ApiPropertyOptional({ description: "Optional external account id (for adapters)", maxLength: 128 })
  @IsString()
  @MaxLength(128)
  @IsOptional()
  externalAccountId?: string
}

