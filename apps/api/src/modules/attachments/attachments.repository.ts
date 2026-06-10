import { Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class AttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getAttachmentOrThrow(input: { workspaceId: string; attachmentId: string }) {
    const a = await this.prisma.attachment.findFirst({
      where: { id: input.attachmentId, workspaceId: input.workspaceId },
      include: { message: { include: { conversation: true } } },
    })
    if (!a) throw new NotFoundException("Attachment not found")
    return a
  }

  async findShortLinkByAttachmentId(attachmentId: string) {
    return this.prisma.shortLink.findFirst({ where: { attachmentId } })
  }

  async createShortLink(input: { workspaceId: string; attachmentId: string; token: string; expiresAt: Date }) {
    return this.prisma.shortLink.create({
      data: {
        workspaceId: input.workspaceId,
        attachmentId: input.attachmentId,
        token: input.token,
        expiresAt: input.expiresAt,
      },
    })
  }

  async rotateShortLink(input: { id: string; token: string; expiresAt: Date }) {
    return this.prisma.shortLink.update({
      where: { id: input.id },
      data: {
        token: input.token,
        expiresAt: input.expiresAt,
        lastAccessedAt: null,
        accessCount: 0,
      },
    })
  }

  async updateShortLinkExpiry(input: { id: string; expiresAt: Date }) {
    return this.prisma.shortLink.update({
      where: { id: input.id },
      data: {
        expiresAt: input.expiresAt,
      },
    })
  }

  async setAttachmentExpiry(input: { attachmentId: string; expiresAt: Date }) {
    return this.prisma.attachment.update({
      where: { id: input.attachmentId },
      data: {
        expiresAt: input.expiresAt,
      },
    })
  }
}
