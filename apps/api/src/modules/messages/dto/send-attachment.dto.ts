import { ApiProperty } from "@nestjs/swagger"
import { IsString, MaxLength, MinLength } from "class-validator"

export class SendAttachmentDto {
  @ApiProperty({ description: "Client-side idempotency key" })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  clientMessageId!: string
}

