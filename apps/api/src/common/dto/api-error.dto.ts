import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { ErrorCode } from "@omnichat/contracts"

export class ApiErrorDto {
  @ApiProperty({ enum: ErrorCode, example: ErrorCode.ValidationFailed })
  code!: ErrorCode

  @ApiProperty({ example: 400 })
  statusCode!: number

  @ApiProperty({ example: "BadRequest" })
  error!: string

  @ApiProperty({ example: "Invalid input" })
  message!: string

  @ApiPropertyOptional({ type: String, nullable: true, example: "req_123" })
  requestId?: string | null

  @ApiProperty({ example: "/v1/auth/start-email-login" })
  path!: string

  @ApiPropertyOptional({
    description: "Optional machine-readable details. Present for validation errors.",
    nullable: true,
    example: { issues: ["email must be an email"] },
  })
  details?: unknown | null
}
