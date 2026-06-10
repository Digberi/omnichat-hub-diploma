import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { Prisma } from "@omnichat/db"

import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class StatusesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    return this.prisma.status.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    })
  }

  async create(input: { workspaceId: string; name: string; color: string; icon: string; sortOrder: number }) {
    try {
      return await this.prisma.status.create({
        data: {
          workspaceId: input.workspaceId,
          name: input.name,
          color: input.color,
          icon: input.icon,
          sortOrder: input.sortOrder,
        },
      })
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Status with the same name already exists")
      }
      throw err
    }
  }

  async update(input: {
    workspaceId: string
    statusId: string
    name?: string
    color?: string
    icon?: string
    sortOrder?: number
  }) {
    const status = await this.prisma.status.findFirst({
      where: { id: input.statusId, workspaceId: input.workspaceId },
    })
    if (!status) throw new NotFoundException("Status not found")
    if (status.isSystem) throw new BadRequestException("Cannot modify system status")

    try {
      return await this.prisma.status.update({
        where: { id: status.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.icon !== undefined ? { icon: input.icon } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
      })
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Status with the same name already exists")
      }
      throw err
    }
  }

  async remove(input: { workspaceId: string; statusId: string }) {
    const status = await this.prisma.status.findFirst({
      where: { id: input.statusId, workspaceId: input.workspaceId },
    })
    if (!status) throw new NotFoundException("Status not found")
    if (status.isSystem) throw new BadRequestException("Cannot delete system status")

    await this.prisma.status.delete({ where: { id: status.id } })
    return { ok: true }
  }
}

