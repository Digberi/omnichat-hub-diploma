import { ApiProperty } from "@nestjs/swagger"
import { IsString, MaxLength, MinLength } from "class-validator"

export class SendTextDto {
  @ApiProperty({ description: "Client-side idempotency key" })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  clientMessageId!: string

  @ApiProperty({ description: "Message text" })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text!: string
}

