import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator"
import { Channel, TemplateScope } from "@omnichat/contracts"

export class UpdateTemplateDto {
  @ApiPropertyOptional({ enum: TemplateScope })
  @IsEnum(TemplateScope)
  @IsOptional()
  scope?: TemplateScope

  @ApiPropertyOptional({ enum: Channel })
  @IsEnum(Channel)
  @IsOptional()
  channel?: Channel

  @ApiPropertyOptional({ type: String, nullable: true, description: "Optional category id (null to clear)" })
  @IsString()
  @MaxLength(128)
  @IsOptional()
  categoryId?: string | null

  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @IsOptional()
  title?: string

  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  @IsOptional()
  content?: string
}
