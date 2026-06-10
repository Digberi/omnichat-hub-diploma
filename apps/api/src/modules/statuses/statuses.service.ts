import { Injectable } from "@nestjs/common"

import { StatusesRepository } from "./statuses.repository"

@Injectable()
export class StatusesService {
  constructor(private readonly repo: StatusesRepository) {}

  async list(input: { workspaceId: string }) {
    return this.repo.list(input.workspaceId)
  }

  async create(input: { workspaceId: string; name: string; color: string; icon: string; sortOrder: number }) {
    return this.repo.create(input)
  }

  async update(input: {
    workspaceId: string
    statusId: string
    name?: string
    color?: string
    icon?: string
    sortOrder?: number
  }) {
    return this.repo.update(input)
  }

  async remove(input: { workspaceId: string; statusId: string }) {
    return this.repo.remove(input)
  }
}

