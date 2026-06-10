import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { Channel, TemplateScope } from "@omnichat/contracts"

export class TemplateDto {
  @ApiProperty()
  id!: string

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string

  @ApiProperty({ type: String, format: "date-time" })
  updatedAt!: string

  @ApiProperty({ enum: TemplateScope })
  scope!: TemplateScope

  @ApiPropertyOptional({ enum: Channel, nullable: true })
  channel?: Channel | null

  @ApiPropertyOptional({ type: String, nullable: true })
  categoryId?: string | null

  @ApiProperty()
  title!: string

  @ApiProperty()
  content!: string

  @ApiProperty()
  usageCount!: number
}

