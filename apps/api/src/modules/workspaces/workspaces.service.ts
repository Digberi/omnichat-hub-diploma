import { Injectable } from "@nestjs/common"

import { WorkspacesRepository } from "./workspaces.repository"

@Injectable()
export class WorkspacesService {
  constructor(private readonly repo: WorkspacesRepository) {}

  async getCurrent(input: { workspaceId: string }) {
    return this.repo.getById(input.workspaceId)
  }

  async updateCurrent(input: { workspaceId: string; name: string }) {
    return this.repo.updateName(input.workspaceId, input.name)
  }
}

