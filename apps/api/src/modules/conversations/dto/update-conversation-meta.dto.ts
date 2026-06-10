import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min } from "class-validator"

const paymentStatusValues = ["pending", "paid", "partial", "refunded"] as const
const shippingStatusValues = ["not_shipped", "shipped", "delivered", "returned"] as const

type PaymentStatus = (typeof paymentStatusValues)[number]
type ShippingStatus = (typeof shippingStatusValues)[number]

export class UpdateConversationMetaDto {
  @ApiPropertyOptional({ enum: paymentStatusValues, nullable: true })
  @IsOptional()
  @IsIn(paymentStatusValues)
  paymentStatus?: PaymentStatus | null

  @ApiPropertyOptional({ enum: shippingStatusValues, nullable: true })
  @IsOptional()
  @IsIn(shippingStatusValues)
  shippingStatus?: ShippingStatus | null

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  ttn?: string | null

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderAmount?: number | null

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  sellerNote?: string | null

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601()
  followUpAt?: string | null
}

