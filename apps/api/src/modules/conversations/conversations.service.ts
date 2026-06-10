import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectQueue } from "@nestjs/bullmq"
import type { Queue } from "bullmq"
import { FolderScope } from "@omnichat/contracts"
import { Prisma } from "@omnichat/db"
import { ENVELOPE_CRYPTO } from "@omnichat/kms/nest"
import type { EnvelopeCryptoService } from "@omnichat/kms"

import { ConversationsRepository } from "./conversations.repository"
import { toConversationDetailsDto, toConversationDto } from "./conversations.mapper"
import type { ChannelFilter } from "./dto/list-conversations.dto"
import { PrismaService } from "../prisma/prisma.service"

type DecryptedOlxAuth = {
  accessToken: string
  refreshToken?: string | null
}

const conversationIncludeForDto = {
  tags: { select: { tagId: true } },
  channelAccount: { select: { alias: true } },
  messages: { take: 1, orderBy: { createdAt: "desc" }, select: { text: true, createdAt: true, direction: true } },
} as const

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name)
  constructor(
    private readonly repo: ConversationsRepository,
    private readonly prisma: PrismaService,
    @InjectQueue("outbox.process") private readonly outboxQueue: Queue,
    private readonly config: ConfigService,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCryptoService,
  ) {}

  /**
   * Mark the conversation as read on the upstream channel side. Today
   * only OLX exposes this — `POST /api/partner/threads/{id}/commands`
   * with body `{command:"mark-as-read"}`. Other channels no-op.
   *
   * Best-effort: a failure here never blocks the operator UX (we don't
   * throw to the caller). The endpoint returns 204 always; warnings
   * appear in logs for triaging.
   *
   * Does NOT mutate Conversation.needsReply — that's a separate product
   * rule (operator opening a chat keeps the needs-reply flag).
   */
  async markReadUpstream(input: { workspaceId: string; conversationId: string }): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: input.conversationId, workspaceId: input.workspaceId },
      select: {
        id: true,
        channel: true,
        externalConversationId: true,
        channelAccountId: true,
      },
    })
    if (!conversation) {
      // Don't throw — operator might be looking at a stale conversation.
      // Just log and return.
      this.logger.warn(
        { conversationId: input.conversationId, workspaceId: input.workspaceId },
        "mark-read: conversation not found",
      )
      return
    }
    if (conversation.channel !== "OLX") {
      // Rozetka/Prom don't have a documented mark-read endpoint. No-op.
      return
    }
    if (!conversation.externalConversationId) {
      this.logger.warn(
        { conversationId: conversation.id },
        "mark-read: OLX conversation missing externalConversationId; skipping",
      )
      return
    }

    const account = await this.prisma.channelAccount.findFirst({
      where: { id: conversation.channelAccountId, workspaceId: input.workspaceId, channel: "OLX" },
      select: { id: true, authType: true, authDataEncrypted: true },
    })
    if (!account || account.authType !== "OAUTH" || !account.authDataEncrypted) {
      this.logger.warn(
        { channelAccountId: conversation.channelAccountId },
        "mark-read: OLX channel account not linked / no token; skipping",
      )
      return
    }

    let auth: DecryptedOlxAuth
    try {
      auth = (await this.crypto.decrypt(
        input.workspaceId,
        account.authDataEncrypted,
      )) as DecryptedOlxAuth
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "mark-read: OLX auth decrypt failed; skipping",
      )
      return
    }

    const baseUrl = String(this.config.get<string>("OLX_BASE_URL") ?? "https://www.olx.ua").trim()
    const timeoutMs = Number(this.config.get<number>("OLX_REQUEST_TIMEOUT_MS") ?? 10_000)
    const url = `${baseUrl.replace(/\/+$/, "")}/api/partner/threads/${encodeURIComponent(
      conversation.externalConversationId,
    )}/commands`

    const doSend = async (accessToken: string): Promise<Response> =>
      fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
          version: "2.0",
        },
        body: JSON.stringify({ command: "mark-as-read" }),
        signal: AbortSignal.timeout(timeoutMs),
      })

    try {
      let res = await doSend(auth.accessToken)
      // 401 → refresh + retry once. OLX access tokens are short-lived
      // (~2h) but the worker poll refreshes them passively; the inbox
      // mark-read path is fire-and-forget at chat open and may miss the
      // refresh window for chats that haven't received fresh inbound.
      if (res.status === 401 && auth.refreshToken) {
        const refreshed = await this.refreshOlxAccessToken({
          refreshToken: auth.refreshToken,
          baseUrl,
          timeoutMs,
        })
        if (refreshed) {
          await this.prisma.channelAccount.update({
            where: { id: account.id },
            data: {
              authDataEncrypted: await this.crypto.encrypt(input.workspaceId, {
                schemaVersion: 1,
                provider: "OLX",
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken ?? auth.refreshToken,
                expiresIn: refreshed.expiresIn ?? null,
                scope: refreshed.scope ?? null,
                tokenType: refreshed.tokenType ?? null,
                obtainedAt: new Date().toISOString(),
              }),
              lastError: null,
              lastSyncAt: new Date(),
            },
          })
          res = await doSend(refreshed.accessToken)
        }
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        this.logger.warn(
          { status: res.status, body: body.slice(0, 200), conversationId: conversation.id },
          "mark-read: OLX returned non-2xx; skipping",
        )
        return
      }
      // Some OLX endpoints return 200 with `{success:false}` envelope; log
      // a sample so the success path isn't a black box during incident
      // triage. Without this we have no way to tell apart "OLX accepted
      // the command" from "OLX silently dropped it" — the user reported
      // both modes look identical from the inbox UI.
      const sample = await res.text().catch(() => "")
      this.logger.log(
        { status: res.status, body: sample.slice(0, 200), conversationId: conversation.id },
        "mark-read: OLX accepted (2xx)",
      )
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err), conversationId: conversation.id },
        "mark-read: OLX fetch threw; skipping",
      )
      return
    }

    // Product rule update: also clear our DB's needsReply when the
    // operator opens the chat. The original rule kept needsReply=true
    // ("operator still sees this chat hasn't been answered yet") but in
    // practice users expect the inbox badge to disappear after opening
    // a thread. Worker still re-sets needsReply=true on any new inbound
    // message, so the chat correctly re-flags itself when the buyer
    // replies. Fan out conversation.updated so the WS client clears the
    // badge without waiting for a list refetch.
    const updated = await this.prisma.conversation.updateMany({
      where: { id: conversation.id, needsReply: true },
      data: { needsReply: false },
    })
    if (updated.count > 0) {
      const occurredAt = new Date().toISOString()
      await this.prisma.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "conversation.updated",
          aggregateId: conversation.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt,
            data: {
              conversationId: conversation.id,
              patch: { needsReply: false },
            },
          } as unknown as Prisma.InputJsonValue,
          status: "PENDING",
          nextAttemptAt: new Date(),
        },
      })
      await this.outboxQueue.add(
        "process",
        { workspaceId: input.workspaceId },
        { removeOnComplete: true, removeOnFail: true },
      )
    }
  }

  /**
   * Exchange refresh_token for a new access_token. Returns null on
   * failure — caller logs + skips. Duplicates the same OAuth shape that
   * MessagesService.refreshOlxAccessToken uses; both should fold into a
   * shared OlxApiService when we touch this code path again.
   */
  private async refreshOlxAccessToken(input: {
    refreshToken: string
    baseUrl: string
    timeoutMs: number
  }): Promise<{
    accessToken: string
    refreshToken: string | null
    expiresIn: number | null
    scope: string | null
    tokenType: string | null
  } | null> {
    const clientId = String(this.config.get<string>("OLX_CLIENT_ID") ?? "").trim()
    const clientSecret = String(this.config.get<string>("OLX_CLIENT_SECRET") ?? "").trim()
    if (!clientId || !clientSecret) {
      this.logger.warn("mark-read: OLX_CLIENT_ID / OLX_CLIENT_SECRET missing; refresh skipped")
      return null
    }
    try {
      const res = await fetch(`${input.baseUrl.replace(/\/+$/, "")}/api/open/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: input.refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
        signal: AbortSignal.timeout(input.timeoutMs),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        this.logger.warn(
          { status: res.status, body: body.slice(0, 200) },
          "mark-read: OLX refresh non-2xx",
        )
        return null
      }
      const json = (await res.json()) as Record<string, unknown>
      const accessToken = typeof json.access_token === "string" ? json.access_token : null
      if (!accessToken) {
        this.logger.warn("mark-read: OLX refresh response missing access_token")
        return null
      }
      return {
        accessToken,
        refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
        expiresIn: typeof json.expires_in === "number" ? json.expires_in : null,
        scope: typeof json.scope === "string" ? json.scope : null,
        tokenType: typeof json.token_type === "string" ? json.token_type : null,
      }
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "mark-read: OLX refresh threw",
      )
      return null
    }
  }

  async list(input: {
    workspaceId: string
    folder?: FolderScope
    channel?: ChannelFilter
    limit?: number
    cursor?: string
  }) {
    return this.repo.list({
      workspaceId: input.workspaceId,
      folder: input.folder ?? FolderScope.ALL,
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      limit: input.limit ?? 30,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    })
  }

  async get(input: { workspaceId: string; conversationId: string }) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: input.conversationId, workspaceId: input.workspaceId },
      include: {
        tags: { select: { tagId: true } },
        channelAccount: { select: { alias: true } },
        messages: { take: 1, orderBy: { createdAt: "desc" }, select: { text: true, createdAt: true, direction: true } },
      },
    })
    if (!conversation) throw new NotFoundException("Conversation not found")
    return toConversationDetailsDto(conversation)
  }

  async pin(input: { workspaceId: string; conversationId: string }) {
    const now = new Date()

    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: input.conversationId, workspaceId: input.workspaceId },
        include: conversationIncludeForDto,
      })
      if (!conversation) throw new NotFoundException("Conversation not found")
      if (conversation.isArchived) throw new BadRequestException("Cannot pin archived conversation")
      if (conversation.isPinnedInAll) return { conversation, outboxId: null as string | null }

      const pinnedCount = await tx.conversation.count({
        where: { workspaceId: input.workspaceId, isArchived: false, isPinnedInAll: true },
      })
      if (pinnedCount >= 3) throw new BadRequestException("Max pinned conversations reached")

      const updated = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          isPinnedInAll: true,
          pinnedAt: now,
        },
        include: conversationIncludeForDto,
      })

      const outbox = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "conversation.updated",
          aggregateId: conversation.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt: now.toISOString(),
            data: {
              conversationId: conversation.id,
              patch: {
                isPinnedInAll: true,
                pinnedAt: now.toISOString(),
              },
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      return { conversation: updated, outboxId: outbox.id }
    })

    if (result.outboxId) {
      await this.outboxQueue.add(
        "process",
        { outboxEventId: result.outboxId },
        { removeOnComplete: true, removeOnFail: true },
      )
    }

    return toConversationDto(result.conversation)
  }

  async unpin(input: { workspaceId: string; conversationId: string }) {
    const now = new Date()

    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: input.conversationId, workspaceId: input.workspaceId },
        include: conversationIncludeForDto,
      })
      if (!conversation) throw new NotFoundException("Conversation not found")
      if (!conversation.isPinnedInAll) return { conversation, outboxId: null as string | null }

      const updated = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          isPinnedInAll: false,
          pinnedAt: null,
        },
        include: conversationIncludeForDto,
      })

      const outbox = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "conversation.updated",
          aggregateId: conversation.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt: now.toISOString(),
            data: {
              conversationId: conversation.id,
              patch: {
                isPinnedInAll: false,
                pinnedAt: null,
              },
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      return { conversation: updated, outboxId: outbox.id }
    })

    if (result.outboxId) {
      await this.outboxQueue.add(
        "process",
        { outboxEventId: result.outboxId },
        { removeOnComplete: true, removeOnFail: true },
      )
    }

    return toConversationDto(result.conversation)
  }

  async archive(input: { workspaceId: string; conversationId: string; confirmUnpin: boolean }) {
    const now = new Date()

    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: input.conversationId, workspaceId: input.workspaceId },
        include: conversationIncludeForDto,
      })
      if (!conversation) throw new NotFoundException("Conversation not found")
      if (conversation.isArchived) return { conversation, outboxId: null as string | null }

      if (conversation.isPinnedInAll && !input.confirmUnpin) {
        throw new BadRequestException('Pinned conversations require explicit confirmation: "Unpin & Archive"')
      }

      const updated = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          isArchived: true,
          archivedAt: now,
          isPinnedInAll: false,
          pinnedAt: null,
        },
        include: conversationIncludeForDto,
      })

      const outbox = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "conversation.updated",
          aggregateId: conversation.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt: now.toISOString(),
            data: {
              conversationId: conversation.id,
              patch: {
                isArchived: true,
                archivedAt: now.toISOString(),
                isPinnedInAll: false,
                pinnedAt: null,
              },
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      return { conversation: updated, outboxId: outbox.id }
    })

    if (result.outboxId) {
      await this.outboxQueue.add(
        "process",
        { outboxEventId: result.outboxId },
        { removeOnComplete: true, removeOnFail: true },
      )
    }

    return toConversationDto(result.conversation)
  }

  async unarchive(input: { workspaceId: string; conversationId: string }) {
    const now = new Date()

    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: input.conversationId, workspaceId: input.workspaceId },
        include: conversationIncludeForDto,
      })
      if (!conversation) throw new NotFoundException("Conversation not found")
      if (!conversation.isArchived) return { conversation, outboxId: null as string | null }

      const updated = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          isArchived: false,
          archivedAt: null,
          isPinnedInAll: false,
          pinnedAt: null,
        },
        include: conversationIncludeForDto,
      })

      const outbox = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "conversation.updated",
          aggregateId: conversation.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt: now.toISOString(),
            data: {
              conversationId: conversation.id,
              patch: {
                isArchived: false,
                archivedAt: null,
                isPinnedInAll: false,
                pinnedAt: null,
              },
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      return { conversation: updated, outboxId: outbox.id }
    })

    if (result.outboxId) {
      await this.outboxQueue.add(
        "process",
        { outboxEventId: result.outboxId },
        { removeOnComplete: true, removeOnFail: true },
      )
    }

    return toConversationDto(result.conversation)
  }

  async snooze(input: { workspaceId: string; conversationId: string; untilIso: string }) {
    const now = new Date()
    const until = new Date(input.untilIso)
    if (!Number.isFinite(until.getTime())) throw new BadRequestException("Invalid until timestamp")
    if (until <= now) throw new BadRequestException("until must be in the future")

    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: input.conversationId, workspaceId: input.workspaceId },
        include: conversationIncludeForDto,
      })
      if (!conversation) throw new NotFoundException("Conversation not found")

      const updated = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          snoozedUntil: until,
        },
        include: conversationIncludeForDto,
      })

      const outbox = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "conversation.updated",
          aggregateId: conversation.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt: now.toISOString(),
            data: {
              conversationId: conversation.id,
              patch: {
                snoozedUntil: until.toISOString(),
              },
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      return { conversation: updated, outboxId: outbox.id }
    })

    await this.outboxQueue.add(
      "process",
      { outboxEventId: result.outboxId },
      { removeOnComplete: true, removeOnFail: true },
    )

    return toConversationDto(result.conversation)
  }

  async unsnooze(input: { workspaceId: string; conversationId: string }) {
    const now = new Date()

    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: input.conversationId, workspaceId: input.workspaceId },
        include: conversationIncludeForDto,
      })
      if (!conversation) throw new NotFoundException("Conversation not found")
      if (conversation.snoozedUntil === null) return { conversation, outboxId: null as string | null }

      const updated = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          snoozedUntil: null,
        },
        include: conversationIncludeForDto,
      })

      const outbox = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "conversation.updated",
          aggregateId: conversation.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt: now.toISOString(),
            data: {
              conversationId: conversation.id,
              patch: {
                snoozedUntil: null,
              },
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      return { conversation: updated, outboxId: outbox.id }
    })

    if (result.outboxId) {
      await this.outboxQueue.add(
        "process",
        { outboxEventId: result.outboxId },
        { removeOnComplete: true, removeOnFail: true },
      )
    }

    return toConversationDto(result.conversation)
  }

  async setStatus(input: { workspaceId: string; conversationId: string; statusId: string | null }) {
    const now = new Date()

    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: input.conversationId, workspaceId: input.workspaceId },
        include: conversationIncludeForDto,
      })
      if (!conversation) throw new NotFoundException("Conversation not found")

      if (input.statusId !== null) {
        const status = await tx.status.findFirst({
          where: { id: input.statusId, workspaceId: input.workspaceId },
          select: { id: true },
        })
        if (!status) throw new BadRequestException("Invalid statusId")
      }

      const updated = await tx.conversation.update({
        where: { id: conversation.id },
        data: { statusId: input.statusId },
        include: conversationIncludeForDto,
      })

      const outbox = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "conversation.updated",
          aggregateId: conversation.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt: now.toISOString(),
            data: {
              conversationId: conversation.id,
              patch: {
                statusId: input.statusId,
              },
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      return { conversation: updated, outboxId: outbox.id }
    })

    await this.outboxQueue.add("process", { outboxEventId: result.outboxId }, { removeOnComplete: true, removeOnFail: true })

    return toConversationDto(result.conversation)
  }

  async setTags(input: { workspaceId: string; conversationId: string; tagIds: string[] }) {
    const now = new Date()
    const tagIds = Array.from(new Set(input.tagIds))

    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: input.conversationId, workspaceId: input.workspaceId },
        include: conversationIncludeForDto,
      })
      if (!conversation) throw new NotFoundException("Conversation not found")

      if (tagIds.length > 0) {
        const tags = await tx.tag.findMany({
          where: { workspaceId: input.workspaceId, id: { in: tagIds } },
          select: { id: true },
        })
        if (tags.length !== tagIds.length) throw new BadRequestException("Invalid tagIds")
      }

      await tx.conversationTag.deleteMany({ where: { conversationId: conversation.id } })
      if (tagIds.length > 0) {
        await tx.conversationTag.createMany({
          data: tagIds.map((tagId) => ({ conversationId: conversation.id, tagId })),
          skipDuplicates: true,
        })
      }

      const updated = await tx.conversation.findFirstOrThrow({
        where: { id: conversation.id },
        include: conversationIncludeForDto,
      })

      const outbox = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "conversation.updated",
          aggregateId: conversation.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt: now.toISOString(),
            data: {
              conversationId: conversation.id,
              patch: {
                tagIds,
              },
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      return { conversation: updated, outboxId: outbox.id }
    })

    await this.outboxQueue.add("process", { outboxEventId: result.outboxId }, { removeOnComplete: true, removeOnFail: true })

    return toConversationDto(result.conversation)
  }

  async updateMeta(input: {
    workspaceId: string
    conversationId: string
    paymentStatus?: "pending" | "paid" | "partial" | "refunded" | null
    shippingStatus?: "not_shipped" | "shipped" | "delivered" | "returned" | null
    ttn?: string | null
    orderAmount?: number | null
    sellerNote?: string | null
    followUpAt?: string | null
  }) {
    const now = new Date()

    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: input.conversationId, workspaceId: input.workspaceId },
        include: conversationIncludeForDto,
      })
      if (!conversation) throw new NotFoundException("Conversation not found")

      const data: any = {}
      const patch: any = {}

      if (input.paymentStatus !== undefined) {
        data.paymentStatus = input.paymentStatus
        patch.paymentStatus = input.paymentStatus
      }
      if (input.shippingStatus !== undefined) {
        data.shippingStatus = input.shippingStatus
        patch.shippingStatus = input.shippingStatus
      }
      if (input.ttn !== undefined) {
        data.ttn = input.ttn
        patch.ttn = input.ttn
      }
      if (input.orderAmount !== undefined) {
        data.orderAmount = input.orderAmount
        patch.orderAmount = input.orderAmount
      }
      if (input.sellerNote !== undefined) {
        data.sellerNote = input.sellerNote
        patch.sellerNote = input.sellerNote
      }
      if (input.followUpAt !== undefined) {
        data.followUpAt = input.followUpAt ? new Date(input.followUpAt) : null
        patch.followUpAt = input.followUpAt
      }

      if (Object.keys(patch).length === 0) {
        return { conversation, outboxId: null as string | null }
      }

      const updated = await tx.conversation.update({
        where: { id: conversation.id },
        data,
        include: conversationIncludeForDto,
      })

      const outbox = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "conversation.updated",
          aggregateId: conversation.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt: now.toISOString(),
            data: {
              conversationId: conversation.id,
              patch,
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      return { conversation: updated, outboxId: outbox.id }
    })

    if (result.outboxId) {
      await this.outboxQueue.add(
        "process",
        { outboxEventId: result.outboxId },
        { removeOnComplete: true, removeOnFail: true },
      )
    }

    return toConversationDto(result.conversation)
  }
}
