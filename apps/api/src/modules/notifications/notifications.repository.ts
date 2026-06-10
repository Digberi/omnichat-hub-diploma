import { Injectable } from "@nestjs/common"
import type { DevicePlatform } from "@omnichat/contracts"

import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async registerDeviceToken(input: { userId: string; workspaceId: string; platform: DevicePlatform; token: string }) {
    return this.prisma.devicePushToken.upsert({
      where: { platform_token: { platform: input.platform, token: input.token } },
      update: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        isEnabled: true,
      },
      create: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        platform: input.platform,
        token: input.token,
        isEnabled: true,
      },
    })
  }

  async getPreferences(workspaceId: string) {
    return this.prisma.workspaceSettings.upsert({
      where: { workspaceId },
      update: {},
      create: { workspaceId },
    })
  }

  async updatePreferences(
    workspaceId: string,
    patch: Partial<{
      pushNewMessageEnabled: boolean
      pushSendErrorEnabled: boolean
      pushSnoozeEnabled: boolean
      pushSyncErrorEnabled: boolean
      pushExpiryEnabled: boolean
    }>,
  ) {
    return this.prisma.workspaceSettings.upsert({
      where: { workspaceId },
      update: patch,
      create: { workspaceId, ...patch },
    })
  }
}

