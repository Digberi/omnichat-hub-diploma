import { Injectable } from "@nestjs/common"

import { TagsRepository } from "./tags.repository"

@Injectable()
export class TagsService {
  constructor(private readonly repo: TagsRepository) {}

  async list(input: { workspaceId: string }) {
    return this.repo.list(input.workspaceId)
  }

  async create(input: { workspaceId: string; name: string; color: string; icon: string }) {
    return this.repo.create(input)
  }

  async update(input: { workspaceId: string; tagId: string; name?: string; color?: string; icon?: string }) {
    return this.repo.update(input)
  }

  async remove(input: { workspaceId: string; tagId: string }) {
    return this.repo.remove(input)
  }
}

