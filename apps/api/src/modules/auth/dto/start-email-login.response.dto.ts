import { ApiProperty } from "@nestjs/swagger"

export class StartEmailLoginResponseDto {
  @ApiProperty({ example: true })
  ok!: true
}

