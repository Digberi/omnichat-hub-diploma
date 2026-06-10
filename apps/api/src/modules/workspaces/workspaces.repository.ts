import { Injectable, NotFoundException } from "@nestjs/common"

import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class WorkspacesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getById(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!ws) throw new NotFoundException("Workspace not found")
    return ws
  }

  async updateName(workspaceId: string, name: string) {
    return this.prisma.workspace.update({ where: { id: workspaceId }, data: { name } })
  }
}

