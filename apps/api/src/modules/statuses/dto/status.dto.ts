import { ApiProperty } from "@nestjs/swagger"

export class StatusDto {
  @ApiProperty()
  id!: string

  @ApiProperty()
  name!: string

  @ApiProperty()
  color!: string

  @ApiProperty()
  icon!: string

  @ApiProperty()
  sortOrder!: number
}

