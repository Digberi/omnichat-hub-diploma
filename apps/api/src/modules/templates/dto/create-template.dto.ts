import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator"
import { Channel, TemplateScope } from "@omnichat/contracts"

export class CreateTemplateDto {
  @ApiProperty({ enum: TemplateScope })
  @IsEnum(TemplateScope)
  scope!: TemplateScope

  @ApiPropertyOptional({ enum: Channel, description: "Required when scope=CHANNEL" })
  @IsEnum(Channel)
  @IsOptional()
  channel?: Channel

  @ApiPropertyOptional({ description: "Optional category id" })
  @IsString()
  @MaxLength(128)
  @IsOptional()
  categoryId?: string

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  content!: string
}

