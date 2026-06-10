import { ApiProperty } from "@nestjs/swagger"

export class WorkspaceDto {
  @ApiProperty()
  id!: string

  @ApiProperty()
  name!: string

  @ApiProperty({ format: "date-time" })
  createdAt!: string

  @ApiProperty({ format: "date-time" })
  updatedAt!: string
}

