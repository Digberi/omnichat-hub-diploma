import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { Type } from "class-transformer"
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator"

export class SearchQueryDto {
  @ApiProperty({ description: "Search query" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  query!: string

  @ApiPropertyOptional({ description: "If true, searches full history (otherwise defaults to recent window)" })
  @IsIn(["0", "1", "true", "false"])
  @IsOptional()
  showOlder?: string

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number
}

