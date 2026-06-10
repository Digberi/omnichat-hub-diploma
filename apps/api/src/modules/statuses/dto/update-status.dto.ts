import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator"

const colorPattern = /^(#[0-9a-fA-F]{6}|\d{1,3}\s+\d{1,3}%\s+\d{1,3}%)$/

export class UpdateStatusDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @IsOptional()
  name?: string

  @ApiPropertyOptional({ example: "217 91% 60%" })
  @IsString()
  @Matches(colorPattern)
  @IsOptional()
  color?: string

  @ApiPropertyOptional({ description: "Icon (emoji or registry id)", example: "🆕" })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @IsOptional()
  icon?: string

  @ApiPropertyOptional({ minimum: 0, maximum: 100000 })
  @IsInt()
  @Min(0)
  @Max(100000)
  @IsOptional()
  sortOrder?: number
}
