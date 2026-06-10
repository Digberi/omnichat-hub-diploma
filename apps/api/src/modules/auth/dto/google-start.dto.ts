import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsOptional, IsString } from "class-validator"

export class GoogleStartQueryDto {
  @ApiPropertyOptional({
    description: "Absolute URL to redirect back to after successful Google OAuth. Must match allowed web origin.",
    example: "http://localhost:3000/login?next=%2Finbox",
  })
  @IsOptional()
  @IsString()
  redirectTo?: string
}

export class GoogleAuthUrlResponseDto {
  @ApiProperty()
  url!: string
}
