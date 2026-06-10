import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator"

export class RozetkaConnectDto {
  @ApiPropertyOptional({
    description: "Display alias for the linked Rozetka account. Defaults to a generated ROZETKA alias.",
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  alias?: string

  @ApiPropertyOptional({
    description: "Optional existing ROZETKA channel account id to re-link with a new API token.",
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  channelAccountId?: string

  @ApiPropertyOptional({
    description: "Optional explicit Rozetka API base URL. Defaults to https://api-seller.rozetka.com.ua.",
    example: "https://api-seller.rozetka.com.ua",
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  apiBaseUrl?: string

  @ApiPropertyOptional({
    description: "Rozetka seller API token bound to a role with correspondence access.",
    minLength: 16,
    maxLength: 512,
  })
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  apiToken!: string
}
