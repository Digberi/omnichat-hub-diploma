import type { ChannelAccountDto } from "./dto/channel-account.dto"

export function toChannelAccountDto(row: any): ChannelAccountDto {
  return {
    id: row.id,
    channel: row.channel,
    alias: row.alias,
    externalAccountId: row.externalAccountId ?? null,
    authType: row.authType,
    isEnabled: row.isEnabled,
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastError: row.lastError ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

