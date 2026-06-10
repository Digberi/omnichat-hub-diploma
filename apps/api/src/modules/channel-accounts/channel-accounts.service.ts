import { Injectable } from "@nestjs/common"
import type { Channel } from "@omnichat/contracts"

import { ChannelAccountsRepository } from "./channel-accounts.repository"

@Injectable()
export class ChannelAccountsService {
  constructor(private readonly repo: ChannelAccountsRepository) {}

  async list(input: { workspaceId: string }) {
    return this.repo.list(input.workspaceId)
  }

  async createStub(input: { workspaceId: string; channel: Channel; alias: string; externalAccountId?: string }) {
    return this.repo.createStub(input)
  }

  async updateAlias(input: { workspaceId: string; channelAccountId: string; alias: string }) {
    return this.repo.updateAlias(input)
  }

  async disable(input: { workspaceId: string; channelAccountId: string }) {
    return this.repo.disable(input)
  }
}

