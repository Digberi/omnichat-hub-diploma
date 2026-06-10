import { Injectable } from "@nestjs/common"
import type { DevicePlatform } from "@omnichat/contracts"

import { NotificationsRepository } from "./notifications.repository"

@Injectable()
export class NotificationsService {
  constructor(private readonly repo: NotificationsRepository) {}

  async registerDeviceToken(input: { userId: string; workspaceId: string; platform: DevicePlatform; token: string }) {
    return this.repo.registerDeviceToken(input)
  }

  async getPreferences(input: { workspaceId: string }) {
    const s = await this.repo.getPreferences(input.workspaceId)
    return {
      pushNewMessageEnabled: s.pushNewMessageEnabled,
      pushSendErrorEnabled: s.pushSendErrorEnabled,
      pushSnoozeEnabled: s.pushSnoozeEnabled,
      pushSyncErrorEnabled: s.pushSyncErrorEnabled,
      pushExpiryEnabled: s.pushExpiryEnabled,
      notificationPrefsJson: s.notificationPrefsJson ?? null,
      updatedAt: s.updatedAt.toISOString(),
    }
  }

  async updatePreferences(
    input: {
      workspaceId: string
    } & Partial<{
      pushNewMessageEnabled: boolean
      pushSendErrorEnabled: boolean
      pushSnoozeEnabled: boolean
      pushSyncErrorEnabled: boolean
      pushExpiryEnabled: boolean
    }>,
  ) {
    const { workspaceId, ...patch } = input
    const s = await this.repo.updatePreferences(workspaceId, patch)
    return {
      pushNewMessageEnabled: s.pushNewMessageEnabled,
      pushSendErrorEnabled: s.pushSendErrorEnabled,
      pushSnoozeEnabled: s.pushSnoozeEnabled,
      pushSyncErrorEnabled: s.pushSyncErrorEnabled,
      pushExpiryEnabled: s.pushExpiryEnabled,
      notificationPrefsJson: s.notificationPrefsJson ?? null,
      updatedAt: s.updatedAt.toISOString(),
    }
  }
}

