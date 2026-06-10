import { ApiProperty } from "@nestjs/swagger"
import { IsString, MinLength } from "class-validator"

export class GoogleExchangeDto {
  @ApiProperty({ description: "One-time OAuth exchange code returned to the web app by the /callback redirect." })
  @IsString()
  @MinLength(10)
  code!: string
}

