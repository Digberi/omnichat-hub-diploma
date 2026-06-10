import { ApiProperty } from "@nestjs/swagger"
import { IsString, Matches, MaxLength, MinLength } from "class-validator"

const colorPattern = /^(#[0-9a-fA-F]{6}|\d{1,3}\s+\d{1,3}%\s+\d{1,3}%)$/

export class CreateTagDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string

  @ApiProperty({ example: "45 93% 47%" })
  @IsString()
  @Matches(colorPattern)
  color!: string

  @ApiProperty({ description: "Icon (emoji or registry id)", example: "⭐" })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  icon!: string
}
