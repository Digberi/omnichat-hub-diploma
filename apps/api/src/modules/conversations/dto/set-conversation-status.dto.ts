import { ApiProperty } from "@nestjs/swagger"
import { IsDefined, IsString, MaxLength, ValidateIf } from "class-validator"

export class SetConversationStatusDto {
  @ApiProperty({ type: String, nullable: true, description: "Set to null to clear status" })
  @IsDefined()
  @ValidateIf((o) => o.statusId !== null)
  @IsString()
  @MaxLength(128)
  statusId!: string | null
}

