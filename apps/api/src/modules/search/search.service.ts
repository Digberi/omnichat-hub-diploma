import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

import { SearchRepository } from "./search.repository"
import type { SearchResponseDto } from "./dto/search-response.dto"

@Injectable()
export class SearchService {
  constructor(
    private readonly repo: SearchRepository,
    private readonly config: ConfigService,
  ) {}

  async query(input: { workspaceId: string; query: string; showOlder: boolean; limit: number }): Promise<SearchResponseDto> {
    const now = Date.now()
    const nodeEnv = String(this.config.get("NODE_ENV") ?? "development")
    const defaultDays = nodeEnv === "test" ? 60 : 7
    const days = this.config.get<number>("SEARCH_DEFAULT_DAYS") ?? defaultDays
    const since = new Date(now - days * 24 * 60 * 60_000)
    const limit = Math.min(100, Math.max(1, input.limit))
    const q = input.query.trim()

    const [conversations, messages] = await Promise.all([
      this.repo.searchConversations({
        workspaceId: input.workspaceId,
        query: q,
        since,
        showOlder: input.showOlder,
        limit,
      }),
      this.repo.searchMessages({
        workspaceId: input.workspaceId,
        query: q,
        since,
        showOlder: input.showOlder,
        limit,
      }),
    ])

    return {
      conversations: conversations.map((c) => ({
        id: c.id,
        buyerDisplayName: c.buyerDisplayName,
        contextTitle: c.contextTitle,
        lastActivityAt: c.lastActivityAt ? c.lastActivityAt.toISOString() : null,
      })),
      messages: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
      })),
    }
  }
}
