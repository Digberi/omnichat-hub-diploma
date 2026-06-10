import { Injectable } from "@nestjs/common"

import { PrismaService } from "../prisma/prisma.service"

type MessagesCursor = { createdAt: string; id: string }

function encodeCursor(cursor: MessagesCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

function decodeCursor(raw: string): MessagesCursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8")
    const parsed = JSON.parse(json) as any
    if (!parsed?.createdAt || !parsed?.id) return null
    return { createdAt: String(parsed.createdAt), id: String(parsed.id) }
  } catch {
    return null
  }
}

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    workspaceId: string
    conversationId: string
    limit: number
    cursor?: string
  }): Promise<{ items: any[]; nextCursor: string | null }> {
    const decoded = params.cursor ? decodeCursor(params.cursor) : null

    const where: any = {
      workspaceId: params.workspaceId,
      conversationId: params.conversationId,
      ...(decoded
        ? {
            OR: [
              { createdAt: { lt: new Date(decoded.createdAt) } },
              { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
            ],
          }
        : {}),
    }

    const rows = await this.prisma.message.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
      include: { attachments: true },
    })

    const hasMore = rows.length > params.limit
    const items = hasMore ? rows.slice(0, params.limit) : rows
    const last = items.at(-1)
    const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null

    return { items, nextCursor }
  }

  async around(params: {
    workspaceId: string
    conversationId: string
    messageId: string
    limit: number
  }): Promise<{ items: any[]; anchorMessageId: string } | null> {
    const limit = Math.min(200, Math.max(1, params.limit))
    const before = Math.floor((limit - 1) / 2)
    const after = Math.max(0, limit - 1 - before)

    const anchor = await this.prisma.message.findFirst({
      where: {
        id: params.messageId,
        workspaceId: params.workspaceId,
        conversationId: params.conversationId,
      },
      include: { attachments: true },
    })
    if (!anchor) return null

    const newer = after
      ? await this.prisma.message.findMany({
          where: {
            workspaceId: params.workspaceId,
            conversationId: params.conversationId,
            OR: [{ createdAt: { gt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { gt: anchor.id } }],
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: after,
          include: { attachments: true },
        })
      : []

    const older = before
      ? await this.prisma.message.findMany({
          where: {
            workspaceId: params.workspaceId,
            conversationId: params.conversationId,
            OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }],
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: before,
          include: { attachments: true },
        })
      : []

    return {
      items: [...newer.reverse(), anchor, ...older],
      anchorMessageId: anchor.id,
    }
  }
}
