import { Injectable } from "@nestjs/common"

import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(workspaceId: string) {
    return this.prisma.workspaceSettings.upsert({
      where: { workspaceId },
      update: {},
      create: { workspaceId },
    })
  }

  async update(
    workspaceId: string,
    patch: Partial<{
      autoArchiveDays: number
      openContextExternalDirect: boolean
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

