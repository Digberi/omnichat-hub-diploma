import { Injectable } from "@nestjs/common"

import { PrismaService } from "../prisma/prisma.service"
import { FolderScope } from "@omnichat/contracts"
import type { ChannelFilter } from "./dto/list-conversations.dto"
import type { ConversationDto } from "./dto/conversation.dto"
import { toConversationDto } from "./conversations.mapper"

type ConversationsCursor = { lastActivityAt: string; id: string }

function encodeCursor(cursor: ConversationsCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

function decodeCursor(raw: string): ConversationsCursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8")
    const parsed = JSON.parse(json) as any
    if (!parsed?.lastActivityAt || !parsed?.id) return null
    return { lastActivityAt: String(parsed.lastActivityAt), id: String(parsed.id) }
  } catch {
    return null
  }
}

@Injectable()
export class ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    workspaceId: string
    folder: FolderScope
    channel?: ChannelFilter
    limit: number
    cursor?: string
  }): Promise<{
    pinned: ConversationDto[]
    items: ConversationDto[]
    nextCursor: string | null
  }> {
    const folder = params.folder

    const whereBase: any = { workspaceId: params.workspaceId }

    if (folder === FolderScope.ARCHIVED) whereBase.isArchived = true
    if (folder === FolderScope.ALL) whereBase.isArchived = false
    if (folder === FolderScope.UNREAD) {
      whereBase.isArchived = false
      whereBase.needsReply = true
    }
    if (folder === FolderScope.SNOOZED) {
      whereBase.isArchived = false
      whereBase.snoozedUntil = { not: null }
    }
    if (folder === FolderScope.CHANNEL) {
      whereBase.isArchived = false
      if (params.channel) whereBase.channel = params.channel
    }

    const pinned =
      folder === FolderScope.ALL
        ? await this.prisma.conversation.findMany({
            where: { ...whereBase, isPinnedInAll: true },
            include: {
              tags: { select: { tagId: true } },
              channelAccount: { select: { alias: true } },
              messages: {
                take: 1,
                // For OLX/Rozetka the worker batch-inserts a thread's history
                // in one tick — every message ends up with an identical
                // `createdAt`. Ordering by createdAt alone picks an arbitrary
                // message in that case (undefined tie-break), which means the
                // preview text/direction/timestamp can come from a stale
                // middle-of-thread row instead of the actual newest. Order by
                // the provider's `sentAt` first (truly chronological), fall
                // back to `createdAt` for our own outgoing rows that may not
                // have `sentAt` set yet.
                orderBy: [
                  { sentAt: { sort: "desc", nulls: "last" } },
                  { createdAt: "desc" },
                ],
                select: {
                  text: true,
                  createdAt: true,
                  sentAt: true,
                  direction: true,
                  attachments: { take: 1, select: { kind: true, originalName: true } },
                  _count: { select: { attachments: true } },
                },
              },
            },
            orderBy: [{ pinnedAt: "desc" }, { id: "desc" }],
            take: 3,
          })
        : []

    const decoded = params.cursor ? decodeCursor(params.cursor) : null

    const whereRest: any = {
      ...whereBase,
      ...(folder === FolderScope.ALL ? { isPinnedInAll: false } : {}),
      ...(decoded
        ? {
            OR: [
              { lastActivityAt: { lt: new Date(decoded.lastActivityAt) } },
              { lastActivityAt: new Date(decoded.lastActivityAt), id: { lt: decoded.id } },
            ],
          }
        : {}),
    }

    const rows = await this.prisma.conversation.findMany({
      where: whereRest,
      include: {
        tags: { select: { tagId: true } },
        channelAccount: { select: { alias: true } },
        messages: {
          take: 1,
          // Same ordering as the pinned-query branch above — needs to use
          // `sentAt` so OLX/Rozetka batch-synced threads (every row with an
          // identical `createdAt`) pick the actually-newest message instead
          // of an arbitrary tie-break. The previous PR #57/#59 Edit relied
          // on `replace_all` but only matched the pinned query (different
          // indentation), so this main query was silently still on the old
          // path — that's why the inbox preview times stayed stuck at sync
          // time after PR #57+#59 went out.
          orderBy: [
            { sentAt: { sort: "desc", nulls: "last" } },
            { createdAt: "desc" },
          ],
          select: {
            text: true,
            createdAt: true,
            sentAt: true,
            direction: true,
            attachments: { take: 1, select: { kind: true, originalName: true } },
            _count: { select: { attachments: true } },
          },
        },
      },
      orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
    })

    const hasMore = rows.length > params.limit
    const items = hasMore ? rows.slice(0, params.limit) : rows
    const last = items.at(-1)
    const nextCursor = hasMore && last?.lastActivityAt ? encodeCursor({ lastActivityAt: last.lastActivityAt.toISOString(), id: last.id }) : null

    return { pinned: pinned.map(toConversationDto), items: items.map(toConversationDto), nextCursor }
  }
}
