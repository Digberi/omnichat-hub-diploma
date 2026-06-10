import { Injectable } from "@nestjs/common"
import { Prisma } from "@omnichat/db"

import { PrismaService } from "../prisma/prisma.service"

type ConversationHitRow = {
  id: string
  buyerDisplayName: string
  contextTitle: string | null
  lastActivityAt: Date | null
}

type MessageHitRow = {
  id: string
  conversationId: string
  text: string | null
  createdAt: Date
}

@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async searchConversations(input: { workspaceId: string; query: string; since: Date; showOlder: boolean; limit: number }) {
    const q = input.query
    const since = input.since

    const rows = await this.prisma.$queryRaw<ConversationHitRow[]>(
      Prisma.sql`
        SELECT
          c.id,
          c."buyerDisplayName",
          c."contextTitle",
          c."lastActivityAt"
        FROM "Conversation" c
        WHERE
          c."workspaceId" = ${input.workspaceId}
          AND (${input.showOlder}::boolean OR COALESCE(c."lastActivityAt", c."createdAt") >= ${since})
          AND (
            to_tsvector('simple', COALESCE(c."buyerDisplayName",'') || ' ' || COALESCE(c."contextTitle",'')) @@ plainto_tsquery('simple', ${q})
            OR c."buyerDisplayName" ILIKE ('%' || ${q} || '%')
            OR c."contextTitle" ILIKE ('%' || ${q} || '%')
          )
        ORDER BY c."lastActivityAt" DESC NULLS LAST, c.id DESC
        LIMIT ${input.limit}
      `,
    )

    return rows
  }

  async searchMessages(input: { workspaceId: string; query: string; since: Date; showOlder: boolean; limit: number }) {
    const q = input.query
    const since = input.since

    const rows = await this.prisma.$queryRaw<MessageHitRow[]>(
      Prisma.sql`
        SELECT
          m.id,
          m."conversationId",
          m.text,
          m."createdAt"
        FROM "Message" m
        WHERE
          m."workspaceId" = ${input.workspaceId}
          AND (${input.showOlder}::boolean OR m."createdAt" >= ${since})
          AND (
            to_tsvector('simple', COALESCE(m.text,'')) @@ plainto_tsquery('simple', ${q})
            OR m.text ILIKE ('%' || ${q} || '%')
          )
        ORDER BY m."createdAt" DESC, m.id DESC
        LIMIT ${input.limit}
      `,
    )

    return rows
  }
}

