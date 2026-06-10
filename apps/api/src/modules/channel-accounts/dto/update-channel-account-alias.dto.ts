import { ApiProperty } from "@nestjs/swagger"
import { IsString, MaxLength, MinLength } from "class-validator"

export class UpdateChannelAccountAliasDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  alias!: string
}

