import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsBoolean, IsOptional } from "class-validator"

export class ArchiveConversationDto {
  @ApiPropertyOptional({ description: 'Required when archiving a pinned conversation. Equivalent to "Unpin & Archive".' })
  @IsBoolean()
  @IsOptional()
  confirmUnpin?: boolean
}

