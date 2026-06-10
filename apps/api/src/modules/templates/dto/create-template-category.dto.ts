import { ApiProperty } from "@nestjs/swagger"
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator"

export class CreateTemplateCategoryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string

  @ApiProperty({ default: 0, minimum: 0, maximum: 100000 })
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder!: number
}

