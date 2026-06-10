import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator"

const colorPattern = /^(#[0-9a-fA-F]{6}|\d{1,3}\s+\d{1,3}%\s+\d{1,3}%)$/

export class UpdateTagDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @IsOptional()
  name?: string

  @ApiPropertyOptional({ example: "45 93% 47%" })
  @IsString()
  @Matches(colorPattern)
  @IsOptional()
  color?: string

  @ApiPropertyOptional({ description: "Icon (emoji or registry id)", example: "⭐" })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @IsOptional()
  icon?: string
}
