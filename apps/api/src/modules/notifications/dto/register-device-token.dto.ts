import { ApiProperty } from "@nestjs/swagger"
import { IsEnum, IsString, MaxLength, MinLength } from "class-validator"
import { DevicePlatform } from "@omnichat/contracts"

export class RegisterDeviceTokenDto {
  @ApiProperty({ enum: DevicePlatform })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform

  @ApiProperty({ description: "Push token (Expo token for mobile; opaque string for web)", maxLength: 512 })
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  token!: string
}

