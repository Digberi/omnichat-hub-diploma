import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { Prisma } from "@omnichat/db"
import type { Channel, TemplateScope } from "@omnichat/contracts"

import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class TemplatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(workspaceId: string) {
    return this.prisma.templateCategory.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    })
  }

  async createCategory(input: { workspaceId: string; name: string; sortOrder: number }) {
    try {
      return await this.prisma.templateCategory.create({
        data: {
          workspaceId: input.workspaceId,
          name: input.name,
          sortOrder: input.sortOrder,
        },
      })
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Template category with the same name already exists")
      }
      throw err
    }
  }

  async updateCategory(input: { workspaceId: string; categoryId: string; name?: string; sortOrder?: number }) {
    const cat = await this.prisma.templateCategory.findFirst({
      where: { id: input.categoryId, workspaceId: input.workspaceId },
    })
    if (!cat) throw new NotFoundException("Template category not found")

    try {
      return await this.prisma.templateCategory.update({
        where: { id: cat.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
      })
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Template category with the same name already exists")
      }
      throw err
    }
  }

  async removeCategory(input: { workspaceId: string; categoryId: string }) {
    const cat = await this.prisma.templateCategory.findFirst({
      where: { id: input.categoryId, workspaceId: input.workspaceId },
    })
    if (!cat) throw new NotFoundException("Template category not found")

    await this.prisma.templateCategory.delete({ where: { id: cat.id } })
    return { ok: true }
  }

  async listTemplates(input: { workspaceId: string; scope?: TemplateScope; channel?: Channel; categoryId?: string }) {
    const where: any = { workspaceId: input.workspaceId }
    if (input.scope) where.scope = input.scope
    if (input.channel) where.channel = input.channel
    if (input.categoryId) where.categoryId = input.categoryId

    return this.prisma.template.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    })
  }

  async createTemplate(input: {
    workspaceId: string
    scope: TemplateScope
    channel?: Channel
    categoryId?: string
    title: string
    content: string
  }) {
    if (input.scope === "CHANNEL" && !input.channel) {
      throw new BadRequestException("channel is required when scope=CHANNEL")
    }
    if (input.scope === "GLOBAL" && input.channel) {
      throw new BadRequestException("channel must be omitted when scope=GLOBAL")
    }

    if (input.categoryId) {
      const cat = await this.prisma.templateCategory.findFirst({
        where: { id: input.categoryId, workspaceId: input.workspaceId },
        select: { id: true },
      })
      if (!cat) throw new BadRequestException("categoryId is invalid")
    }

    return this.prisma.template.create({
      data: {
        workspaceId: input.workspaceId,
        scope: input.scope,
        channel: input.channel ?? null,
        categoryId: input.categoryId ?? null,
        title: input.title,
        content: input.content,
      },
    })
  }

  async updateTemplate(input: {
    workspaceId: string
    templateId: string
    scope?: TemplateScope
    channel?: Channel
    categoryId?: string | null
    title?: string
    content?: string
  }) {
    const tpl = await this.prisma.template.findFirst({
      where: { id: input.templateId, workspaceId: input.workspaceId },
    })
    if (!tpl) throw new NotFoundException("Template not found")

    const nextScope = input.scope ?? (tpl.scope as TemplateScope)
    const nextChannel = input.channel !== undefined ? input.channel : (tpl.channel as Channel | null)

    if (nextScope === "CHANNEL" && !nextChannel) {
      throw new BadRequestException("channel is required when scope=CHANNEL")
    }
    if (nextScope === "GLOBAL" && nextChannel) {
      throw new BadRequestException("channel must be omitted when scope=GLOBAL")
    }

    const nextCategoryId = input.categoryId !== undefined ? input.categoryId : tpl.categoryId
    if (nextCategoryId) {
      const cat = await this.prisma.templateCategory.findFirst({
        where: { id: nextCategoryId, workspaceId: input.workspaceId },
        select: { id: true },
      })
      if (!cat) throw new BadRequestException("categoryId is invalid")
    }

    return this.prisma.template.update({
      where: { id: tpl.id },
      data: {
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.channel !== undefined ? { channel: input.channel } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
      },
    })
  }

  async removeTemplate(input: { workspaceId: string; templateId: string }) {
    const tpl = await this.prisma.template.findFirst({
      where: { id: input.templateId, workspaceId: input.workspaceId },
      select: { id: true },
    })
    if (!tpl) throw new NotFoundException("Template not found")

    await this.prisma.template.delete({ where: { id: tpl.id } })
    return { ok: true }
  }
}

