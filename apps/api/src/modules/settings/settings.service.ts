import { Injectable } from "@nestjs/common"

import { SettingsRepository } from "./settings.repository"

@Injectable()
export class SettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  async get(input: { workspaceId: string }) {
    return this.repo.getOrCreate(input.workspaceId)
  }

  async update(
    input: {
      workspaceId: string
    } & Partial<{
      autoArchiveDays: number
      openContextExternalDirect: boolean
      pushNewMessageEnabled: boolean
      pushSendErrorEnabled: boolean
      pushSnoozeEnabled: boolean
      pushSyncErrorEnabled: boolean
      pushExpiryEnabled: boolean
    }>,
  ) {
    const { workspaceId, ...patch } = input
    return this.repo.update(workspaceId, patch)
  }
}

