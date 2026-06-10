import { ApiProperty } from "@nestjs/swagger"

export class CreateShortLinkResponseDto {
  @ApiProperty({ example: "R5tGq2U8i3Jr5y0aVY6d8g" })
  token!: string

  @ApiProperty({ format: "date-time", example: "2026-01-01T12:00:00.000Z" })
  expiresAt!: string

  @ApiProperty({
    description: "Relative URL to the short-link landing endpoint.",
    example: "/v1/s/R5tGq2U8i3Jr5y0aVY6d8g",
  })
  url!: string
}

