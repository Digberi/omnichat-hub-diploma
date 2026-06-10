import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsOptional, IsString, MaxLength } from "class-validator"

export class OlxStartQueryDto {
  @ApiPropertyOptional({
    description: "Absolute URL to redirect back after successful OLX OAuth. Must match allowed web origin.",
    example: "http://localhost:3000/settings?tab=channels",
  })
  @IsOptional()
  @IsString()
  redirectTo?: string

  @ApiPropertyOptional({
    description: "Optional existing OLX channel account id to re-link OAuth credentials into.",
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  channelAccountId?: string
}

export class OlxAuthUrlResponseDto {
  @ApiProperty()
  url!: string
}
