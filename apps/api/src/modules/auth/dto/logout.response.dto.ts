import { ApiProperty } from "@nestjs/swagger"

export class LogoutResponseDto {
  @ApiProperty()
  ok!: true
}

export class LogoutAllResponseDto {
  @ApiProperty()
  ok!: true

  @ApiProperty()
  revoked!: number
}

