import { ConflictException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common"
import { Prisma } from "@omnichat/db"

import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class TagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    return this.prisma.tag.findMany({
      where: { workspaceId },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }, { id: "asc" }],
    })
  }

  async create(input: { workspaceId: string; name: string; color: string; icon: string }) {
    try {
      return await this.prisma.tag.create({
        data: {
          workspaceId: input.workspaceId,
          name: input.name,
          color: input.color,
          icon: input.icon,
        },
      })
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Tag with the same name already exists")
      }
      throw err
    }
  }

  async update(input: { workspaceId: string; tagId: string; name?: string; color?: string; icon?: string }) {
    const tag = await this.prisma.tag.findFirst({
      where: { id: input.tagId, workspaceId: input.workspaceId },
    })
    if (!tag) throw new NotFoundException("Tag not found")
    if (tag.isSystem) throw new BadRequestException("Cannot modify system tag")

    try {
      return await this.prisma.tag.update({
        where: { id: tag.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.icon !== undefined ? { icon: input.icon } : {}),
        },
      })
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Tag with the same name already exists")
      }
      throw err
    }
  }

  async remove(input: { workspaceId: string; tagId: string }) {
    const tag = await this.prisma.tag.findFirst({
      where: { id: input.tagId, workspaceId: input.workspaceId },
    })
    if (!tag) throw new NotFoundException("Tag not found")
    if (tag.isSystem) throw new BadRequestException("Cannot delete system tag")

    await this.prisma.tag.delete({ where: { id: tag.id } })
    return { ok: true }
  }
}

