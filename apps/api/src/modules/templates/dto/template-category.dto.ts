import { ApiProperty } from "@nestjs/swagger"

export class TemplateCategoryDto {
  @ApiProperty()
  id!: string

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string

  @ApiProperty({ type: String, format: "date-time" })
  updatedAt!: string

  @ApiProperty()
  name!: string

  @ApiProperty()
  sortOrder!: number
}

