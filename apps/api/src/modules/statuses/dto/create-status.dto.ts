import { ApiProperty } from "@nestjs/swagger"
import { IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator"

const colorPattern = /^(#[0-9a-fA-F]{6}|\d{1,3}\s+\d{1,3}%\s+\d{1,3}%)$/

export class CreateStatusDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string

  @ApiProperty({ example: "217 91% 60%" })
  @IsString()
  @Matches(colorPattern)
  color!: string

  @ApiProperty({ description: "Icon (emoji or registry id)", example: "🆕" })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  icon!: string

  @ApiProperty({ default: 0, minimum: 0, maximum: 100000 })
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder!: number
}
