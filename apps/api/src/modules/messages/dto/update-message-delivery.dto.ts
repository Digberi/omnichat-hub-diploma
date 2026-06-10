import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator"

export enum MessageDeliveryStatusDto {
  SENDING = "SENDING",
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  READ = "READ",
  FAILED = "FAILED",
}

export class UpdateMessageDeliveryDto {
  @ApiProperty({ enum: MessageDeliveryStatusDto })
  @IsEnum(MessageDeliveryStatusDto)
  deliveryStatus!: MessageDeliveryStatusDto

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  errorCode?: string

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  errorMessage?: string
}

