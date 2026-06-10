import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import type { Channel } from "@omnichat/contracts"

import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class ChannelAccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOlxAccountQuota(workspaceId: string): Promise<{ current: number; max: number }> {
    const [current, workspace] = await Promise.all([
      this.prisma.channelAccount.count({
        where: { workspaceId, channel: "OLX", isEnabled: true },
      }),
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { maxOlxAccounts: true },
      }),
    ])
    if (!workspace) throw new NotFoundException("Workspace not found")
    return { current, max: workspace.maxOlxAccounts }
  }

  async list(workspaceId: string) {
    return this.prisma.channelAccount.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
  }

  async createStub(input: {
    workspaceId: string
    channel: Channel
    alias: string
    externalAccountId?: string
  }) {
    return this.prisma.channelAccount.create({
      data: {
        workspaceId: input.workspaceId,
        channel: input.channel,
        alias: input.alias,
        externalAccountId: input.externalAccountId ?? null,
        authType: "TOKEN",
        authDataEncrypted: null,
        isEnabled: true,
        syncCheckpoint: {
          create: {},
        },
      },
    })
  }

  async updateAlias(input: { workspaceId: string; channelAccountId: string; alias: string }) {
    const account = await this.prisma.channelAccount.findFirst({
      where: { id: input.channelAccountId, workspaceId: input.workspaceId },
      select: { id: true },
    })
    if (!account) throw new NotFoundException("Channel account not found")

    return this.prisma.channelAccount.update({
      where: { id: input.channelAccountId },
      data: { alias: input.alias },
    })
  }

  async disable(input: { workspaceId: string; channelAccountId: string }) {
    const account = await this.prisma.channelAccount.findFirst({
      where: { id: input.channelAccountId, workspaceId: input.workspaceId },
      select: { id: true },
    })
    if (!account) throw new NotFoundException("Channel account not found")

    return this.prisma.channelAccount.update({
      where: { id: input.channelAccountId },
      data: { isEnabled: false },
    })
  }

  private async ensureSyncCheckpoint(channelAccountId: string): Promise<void> {
    await this.prisma.channelSyncCheckpoint.upsert({
      where: { channelAccountId },
      update: {},
      create: { channelAccountId },
    })
  }

  async upsertOlxOAuthAccount(input: {
    workspaceId: string
    channelAccountId?: string
    externalAccountId?: string
    alias: string
    authDataEncrypted: string
  }) {
    const externalAccountId = input.externalAccountId?.trim() || undefined

    const updateData: {
      alias: string
      authType: "OAUTH"
      authDataEncrypted: string
      isEnabled: boolean
      lastError: null
      externalAccountId?: string
    } = {
      alias: input.alias,
      authType: "OAUTH",
      authDataEncrypted: input.authDataEncrypted,
      isEnabled: true,
      lastError: null,
      ...(externalAccountId ? { externalAccountId } : {}),
    }

    if (input.channelAccountId) {
      const existing = await this.prisma.channelAccount.findFirst({
        where: {
          id: input.channelAccountId,
          workspaceId: input.workspaceId,
          channel: "OLX",
        },
        select: { id: true },
      })

      if (!existing) throw new NotFoundException("OLX channel account not found")

      const updated = await this.prisma.channelAccount.update({
        where: { id: input.channelAccountId },
        data: updateData,
      })

      await this.ensureSyncCheckpoint(updated.id)
      return updated
    }

    if (externalAccountId) {
      const existingByExternal = await this.prisma.channelAccount.findFirst({
        where: {
          workspaceId: input.workspaceId,
          channel: "OLX",
          externalAccountId,
        },
        select: { id: true },
      })

      if (existingByExternal) {
        const updated = await this.prisma.channelAccount.update({
          where: { id: existingByExternal.id },
          data: updateData,
        })
        await this.ensureSyncCheckpoint(updated.id)
        return updated
      }
    }

    // Fallback dedup by alias: when /users/me fails (or returns no id) we lose
    // the externalAccountId-based match above. Without this, a second OAuth
    // flow for the same operator creates a duplicate row. Alias is the OLX
    // seller phone — stable across re-connects.
    const existingByAlias = await this.prisma.channelAccount.findFirst({
      where: {
        workspaceId: input.workspaceId,
        channel: "OLX",
        alias: input.alias,
      },
      select: { id: true },
    })

    if (existingByAlias) {
      const updated = await this.prisma.channelAccount.update({
        where: { id: existingByAlias.id },
        data: updateData,
      })
      await this.ensureSyncCheckpoint(updated.id)
      return updated
    }

    // Belt-and-suspenders quota check: OlxOauthService.start() also enforces
    // this before sending the user to OLX, but the callback may run for a state
    // whose quota status changed mid-flight (another OAuth completed first).
    // Re-checking here keeps the invariant if start() is ever bypassed.
    const quota = await this.getOlxAccountQuota(input.workspaceId)
    if (quota.current >= quota.max) {
      throw new ForbiddenException(
        `Workspace has ${quota.current} OLX account(s); maximum allowed is ${quota.max}.`,
      )
    }

    return this.prisma.channelAccount.create({
      data: {
        workspaceId: input.workspaceId,
        channel: "OLX",
        alias: input.alias,
        externalAccountId: externalAccountId ?? null,
        authType: "OAUTH",
        authDataEncrypted: input.authDataEncrypted,
        isEnabled: true,
        lastError: null,
        syncCheckpoint: {
          create: {},
        },
      },
    })
  }

  async upsertPromTokenAccount(input: {
    workspaceId: string
    channelAccountId?: string
    alias: string
    authDataEncrypted: string
  }) {
    const updateData = {
      alias: input.alias,
      authType: "TOKEN" as const,
      authDataEncrypted: input.authDataEncrypted,
      isEnabled: true,
      lastError: null,
    }

    if (input.channelAccountId) {
      const existing = await this.prisma.channelAccount.findFirst({
        where: {
          id: input.channelAccountId,
          workspaceId: input.workspaceId,
          channel: "PROM",
        },
        select: { id: true },
      })

      if (!existing) throw new NotFoundException("PROM channel account not found")

      const updated = await this.prisma.channelAccount.update({
        where: { id: input.channelAccountId },
        data: updateData,
      })

      await this.ensureSyncCheckpoint(updated.id)
      return updated
    }

    return this.prisma.channelAccount.create({
      data: {
        workspaceId: input.workspaceId,
        channel: "PROM",
        alias: input.alias,
        externalAccountId: null,
        authType: "TOKEN",
        authDataEncrypted: input.authDataEncrypted,
        isEnabled: true,
        lastError: null,
        syncCheckpoint: {
          create: {},
        },
      },
    })
  }

  async upsertRozetkaTokenAccount(input: {
    workspaceId: string
    channelAccountId?: string
    alias: string
    authDataEncrypted: string
  }) {
    const updateData = {
      alias: input.alias,
      authType: "TOKEN" as const,
      authDataEncrypted: input.authDataEncrypted,
      isEnabled: true,
      lastError: null,
    }

    if (input.channelAccountId) {
      const existing = await this.prisma.channelAccount.findFirst({
        where: {
          id: input.channelAccountId,
          workspaceId: input.workspaceId,
          channel: "ROZETKA",
        },
        select: { id: true },
      })

      if (!existing) throw new NotFoundException("ROZETKA channel account not found")

      const updated = await this.prisma.channelAccount.update({
        where: { id: input.channelAccountId },
        data: updateData,
      })

      await this.ensureSyncCheckpoint(updated.id)
      return updated
    }

    return this.prisma.channelAccount.create({
      data: {
        workspaceId: input.workspaceId,
        channel: "ROZETKA",
        alias: input.alias,
        externalAccountId: null,
        authType: "TOKEN",
        authDataEncrypted: input.authDataEncrypted,
        isEnabled: true,
        lastError: null,
        syncCheckpoint: {
          create: {},
        },
      },
    })
  }
}
