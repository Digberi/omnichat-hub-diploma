import { ApiProperty } from "@nestjs/swagger"
import { ArrayUnique, IsArray, IsString, MaxLength } from "class-validator"

export class SetConversationTagsDto {
  @ApiProperty({ type: [String], description: "Set to [] to clear tags" })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  tagIds!: string[]
}

