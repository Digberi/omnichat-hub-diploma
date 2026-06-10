import { Injectable } from "@nestjs/common"

import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class ShortLinksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByToken(token: string) {
    return this.prisma.shortLink.findUnique({
      where: { token },
      include: { attachment: { include: { message: { include: { conversation: true } } } } },
    })
  }

  async markAccessed(input: { id: string }) {
    await this.prisma.shortLink.update({
      where: { id: input.id },
      data: { lastAccessedAt: new Date(), accessCount: { increment: 1 } },
    })
  }
}

