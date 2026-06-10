import { Injectable } from "@nestjs/common"
import type { Channel, TemplateScope } from "@omnichat/contracts"

import { TemplatesRepository } from "./templates.repository"

@Injectable()
export class TemplatesService {
  constructor(private readonly repo: TemplatesRepository) {}

  async listCategories(input: { workspaceId: string }) {
    return this.repo.listCategories(input.workspaceId)
  }

  async createCategory(input: { workspaceId: string; name: string; sortOrder: number }) {
    return this.repo.createCategory(input)
  }

  async updateCategory(input: { workspaceId: string; categoryId: string; name?: string; sortOrder?: number }) {
    return this.repo.updateCategory(input)
  }

  async removeCategory(input: { workspaceId: string; categoryId: string }) {
    return this.repo.removeCategory(input)
  }

  async list(input: { workspaceId: string; scope?: TemplateScope; channel?: Channel; categoryId?: string }) {
    return this.repo.listTemplates(input)
  }

  async create(input: {
    workspaceId: string
    scope: TemplateScope
    channel?: Channel
    categoryId?: string
    title: string
    content: string
  }) {
    return this.repo.createTemplate(input)
  }

  async update(
    input: {
      workspaceId: string
      templateId: string
    } & {
      scope?: TemplateScope
      channel?: Channel
      categoryId?: string | null
      title?: string
      content?: string
    },
  ) {
    return this.repo.updateTemplate(input)
  }

  async remove(input: { workspaceId: string; templateId: string }) {
    return this.repo.removeTemplate(input)
  }
}

