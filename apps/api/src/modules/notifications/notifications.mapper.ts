import type { DevicePushTokenDto } from "./dto/device-push-token.dto"

export function toDevicePushTokenDto(row: any): DevicePushTokenDto {
  return {
    id: row.id,
    platform: row.platform,
    token: row.token,
    isEnabled: row.isEnabled,
    updatedAt: row.updatedAt.toISOString(),
  }
}

