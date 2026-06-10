import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator"
import { Channel, TemplateScope } from "@omnichat/contracts"

export class ListTemplatesQueryDto {
  @ApiPropertyOptional({ enum: TemplateScope })
  @IsEnum(TemplateScope)
  @IsOptional()
  scope?: TemplateScope

  @ApiPropertyOptional({ enum: Channel })
  @IsEnum(Channel)
  @IsOptional()
  channel?: Channel

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(128)
  @IsOptional()
  categoryId?: string
}

