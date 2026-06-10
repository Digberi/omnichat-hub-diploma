import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator"

export class PromConnectDto {
  @ApiPropertyOptional({
    description: "Display alias for the linked Prom account. Defaults to a generated PROM alias.",
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  alias?: string

  @ApiPropertyOptional({
    description: "Optional existing PROM channel account id to re-link with a new API token.",
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  channelAccountId?: string

  @ApiPropertyOptional({
    description: "Optional explicit Prom API base URL. Defaults to https://my.prom.ua/api/v1.",
    example: "https://my.prom.ua/api/v1",
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  apiBaseUrl?: string

  @ApiPropertyOptional({
    description: "Prom company API token from the merchant cabinet.",
    minLength: 16,
    maxLength: 512,
  })
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  apiToken!: string
}
