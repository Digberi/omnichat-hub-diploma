import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"

export class AuthMeResponseDto {
  @ApiProperty()
  userId!: string

  @ApiProperty()
  workspaceId!: string

  @ApiPropertyOptional({ type: String, nullable: true })
  displayName?: string | null

  @ApiPropertyOptional({ type: String, nullable: true })
  email?: string | null

  @ApiProperty({ enum: ["OWNER", "ADMIN", "MEMBER"] })
  role!: "OWNER" | "ADMIN" | "MEMBER"
}

