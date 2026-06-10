import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator"

export class UpdateTemplateCategoryDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @IsOptional()
  name?: string

  @ApiPropertyOptional({ minimum: 0, maximum: 100000 })
  @IsInt()
  @Min(0)
  @Max(100000)
  @IsOptional()
  sortOrder?: number
}

