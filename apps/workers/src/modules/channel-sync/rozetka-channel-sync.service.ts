import { InjectQueue } from "@nestjs/bullmq"
import { Inject, Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { Queue } from "bullmq"
import { PinoLogger } from "nestjs-pino"
import { applyIncomingMessageEffects } from "@omnichat/domain"
import { Prisma } from "@omnichat/db"
import { ENVELOPE_CRYPTO } from "@omnichat/kms/nest"
import type { EnvelopeCryptoService } from "@omnichat/kms"

import { PrismaService } from "../prisma/prisma.service"

const ROZETKA_DEFAULT_BASE_URL = "https://api-seller.rozetka.com.ua"
const ROZETKA_DEFAULT_TIMEOUT_MS = 8_000

type RozetkaAuthData = {
  apiToken: string
  apiBaseUrl?: string
}

type RozetkaUser = {
  id: number
  contact_fio?: string | null
  has_email?: boolean
}

type RozetkaChatSummary = {
  id: number
  updated: string
  user: RozetkaUser
  subject?: string | null
  order_id?: number | null
  type?: number
}

type RozetkaChatsPage = {
  chats: RozetkaChatSummary[]
  totalPages: number
  currentPage: number
}

type RozetkaMessage = {
  chat_id: number
  body: string
  created: string
  receiver_id: number
  sender: number
  seller_id: number | null
  files?: unknown[]
}

type RozetkaChatWithMessages = RozetkaChatSummary & { messages: RozetkaMessage[] }

@Injectable()
export class RozetkaChannelSyncService {
  // Test seam: tests call setFetch() to swap the HTTP client. Production
  // uses the default globalThis.fetch. Kept off the constructor so Nest DI
  // sees only the decorated parameters.
  private fetchFn: typeof globalThis.fetch = globalThis.fetch.bind(globalThis)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCryptoService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @InjectQueue("outbox.process") private readonly outboxQueue: Queue,
  ) {
    this.logger.setContext(RozetkaChannelSyncService.name)
  }

  /** Test seam — replace the HTTP client. Not for production use. */
  setFetch(fn: typeof globalThis.fetch): void {
    this.fetchFn = fn
  }

  async runTick(): Promise<void> {
    const max = Number(this.config.get<number>("CHANNEL_SYNC_ROZETKA_MAX_ACCOUNTS") ?? 50)
    const accounts = await this.prisma.channelAccount.findMany({
      where: {
        channel: "ROZETKA",
        authType: "TOKEN",
        isEnabled: true,
        authDataEncrypted: { not: null },
      },
      select: {
        id: true,
        workspaceId: true,
        externalAccountId: true,
        authDataEncrypted: true,
        syncCheckpoint: { select: { lastMessageAt: true } },
      },
      orderBy: [{ lastSyncAt: "asc" }, { id: "asc" }],
      take: max,
    })

    if (accounts.length === 0) return

    for (const account of accounts) {
      try {
        const auth = (await this.crypto.decrypt(
          account.workspaceId,
          String(account.authDataEncrypted),
        )) as RozetkaAuthData
        const baseUrl = (auth.apiBaseUrl ?? ROZETKA_DEFAULT_BASE_URL).replace(/\/$/, "")

        const lastMessageAt = account.syncCheckpoint?.lastMessageAt ?? null
        let page = 1
        let maxObservedSentAt: Date | null = lastMessageAt

        while (true) {
          const chatsPage = await this.searchChats({
            baseUrl,
            apiToken: auth.apiToken,
            updatedFrom: lastMessageAt,
            page,
          })
          if (chatsPage.chats.length === 0) break

          for (const chatSummary of chatsPage.chats) {
            const chatUpdated = parseRozetkaTimestamp(chatSummary.updated)
            if (lastMessageAt && chatUpdated && chatUpdated <= lastMessageAt) continue

            const chat = await this.getChatWithMessages({
              baseUrl,
              apiToken: auth.apiToken,
              chatId: chatSummary.id,
            })

            const messages = chat.messages ?? []
            for (let msgIndex = 0; msgIndex < messages.length; msgIndex++) {
              const msg = messages[msgIndex]!
              const sentAt = parseRozetkaTimestamp(msg.created)
              if (!sentAt) continue
              if (lastMessageAt && sentAt <= lastMessageAt) continue

              await this.upsertMessage({
                workspaceId: account.workspaceId,
                channelAccountId: account.id,
                chat,
                msg,
                msgIndex,
                sentAt,
              })

              if (!maxObservedSentAt || sentAt > maxObservedSentAt) {
                maxObservedSentAt = sentAt
              }
            }
          }

          if (page >= chatsPage.totalPages) break
          page += 1
        }

        if (maxObservedSentAt && (!lastMessageAt || maxObservedSentAt > lastMessageAt)) {
          await this.prisma.channelSyncCheckpoint.upsert({
            where: { channelAccountId: account.id },
            create: { channelAccountId: account.id, lastMessageAt: maxObservedSentAt },
            update: { lastMessageAt: maxObservedSentAt },
          })
        }
        await this.prisma.channelAccount.update({
          where: { id: account.id },
          data: { lastSyncAt: new Date(), lastError: null },
        })
      } catch (err) {
        const lastError = errorMessage(err).slice(0, 500)
        this.logger.warn(
          { channelAccountId: account.id, err: lastError },
          "Rozetka tick failed for account",
        )
        try {
          await this.prisma.channelAccount.update({
            where: { id: account.id },
            data: { lastError, lastSyncAt: new Date() },
          })
        } catch {
          // Best-effort lastError write — don't let a Prisma transient hide the upstream failure.
        }
      }
    }
  }

  private async searchChats(input: {
    baseUrl: string
    apiToken: string
    updatedFrom: Date | null
    page: number
  }): Promise<RozetkaChatsPage> {
    const url = new URL(`${input.baseUrl}/messages/search`)
    url.searchParams.set("msgType", "orders")
    url.searchParams.set("page", String(input.page))
    if (input.updatedFrom) {
      url.searchParams.set("updated_from", formatRozetkaTimestamp(input.updatedFrom))
    }
    const body = await this.rozetkaRequest(url, input.apiToken)
    const content = (body.content ?? {}) as Record<string, unknown>
    const meta = (content._meta ?? {}) as Record<string, unknown>
    return {
      chats: ((content.chats as RozetkaChatSummary[]) ?? []),
      totalPages: Number(meta.totalPages ?? 1),
      currentPage: Number(meta.currentPage ?? input.page),
    }
  }

  private async getChatWithMessages(input: {
    baseUrl: string
    apiToken: string
    chatId: number
  }): Promise<RozetkaChatWithMessages> {
    const url = new URL(`${input.baseUrl}/messages/${input.chatId}`)
    url.searchParams.set("expand", "messages")
    const body = await this.rozetkaRequest(url, input.apiToken)
    return (body.content ?? {}) as RozetkaChatWithMessages
  }

  private async rozetkaRequest(url: URL, apiToken: string): Promise<Record<string, unknown>> {
    const timeoutMs = Number(
      this.config.get<number>("ROZETKA_REQUEST_TIMEOUT_MS") ?? ROZETKA_DEFAULT_TIMEOUT_MS,
    )
    const res = await this.fetchFn(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await res.text()
    let parsed: any = {}
    try { parsed = JSON.parse(text) } catch { /* keep parsed as {} */ }
    if (!res.ok || parsed?.success === false) {
      const code = parsed?.errors?.code ?? null
      throw new RozetkaApiError(res.status, code, text.slice(0, 500))
    }
    return parsed as Record<string, unknown>
  }

  private async upsertMessage(input: {
    workspaceId: string
    channelAccountId: string
    chat: RozetkaChatWithMessages
    msg: RozetkaMessage
    msgIndex: number
    sentAt: Date
  }): Promise<void> {
    const externalMessageId = buildExternalMessageId(input.chat.id, input.msg.created, input.msgIndex)
    const direction: "IN" | "OUT" = input.msg.seller_id != null ? "OUT" : "IN"
    const buyerName = input.chat.user.contact_fio?.trim() ?? `Покупець ${input.chat.user.id}`
    const text = input.msg.body

    const outboxIds = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const orderKey = input.chat.order_id != null ? String(input.chat.order_id) : null
      const chatKey = String(input.chat.id)
      const lookupKey = orderKey ?? chatKey

      // Conversation has no composite unique on (workspaceId, channelAccountId, externalConversationId).
      // Match Prom pattern: findFirst then create-or-update.
      let conversation = await tx.conversation.findFirst({
        where: {
          workspaceId: input.workspaceId,
          channelAccountId: input.channelAccountId,
          externalConversationId: lookupKey,
        },
        select: {
          id: true,
          needsReply: true,
          isArchived: true,
          isPinnedInAll: true,
          snoozedUntil: true,
        },
      })

      // Lazy backfill: legacy rows were keyed on chat.id. If we have an order_id now
      // and no row at order_id, look up by chat.id and re-key it. This collapses the
      // historical thread into the new unified key without a one-shot SQL migration.
      if (!conversation && orderKey && orderKey !== chatKey) {
        const legacy = await tx.conversation.findFirst({
          where: {
            workspaceId: input.workspaceId,
            channelAccountId: input.channelAccountId,
            externalConversationId: chatKey,
          },
          select: {
            id: true,
            needsReply: true,
            isArchived: true,
            isPinnedInAll: true,
            snoozedUntil: true,
          },
        })
        if (legacy) {
          await tx.conversation.update({
            where: { id: legacy.id },
            data: { externalConversationId: orderKey },
          })
          conversation = legacy
        }
      }

      if (!conversation) {
        conversation = await tx.conversation.create({
          data: {
            workspaceId: input.workspaceId,
            channelAccountId: input.channelAccountId,
            channel: "ROZETKA",
            externalConversationId: lookupKey,
            externalBuyerId: String(input.chat.user.id),
            buyerDisplayName: buyerName,
          },
          select: {
            id: true,
            needsReply: true,
            isArchived: true,
            isPinnedInAll: true,
            snoozedUntil: true,
          },
        })
      }

      const existing = await tx.message.findFirst({
        where: { conversationId: conversation.id, externalMessageId },
        select: { id: true },
      })
      if (existing) return [] as string[]

      const message = await tx.message.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          externalMessageId,
          direction,
          text,
          sentAt: input.sentAt,
          deliveryStatus: direction === "IN" ? "DELIVERED" : "SENT",
        },
      })

      // Direction OUT messages from Rozetka represent things the seller already
      // sent (via Rozetka UI or another tool). Clearing needsReply matches what
      // would have happened if they'd sent the reply through our app — the
      // buyer is no longer waiting on us. Emit a conversation.updated outbox
      // event so connected web clients refresh the badge without a full reload.
      if (direction === "OUT") {
        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            needsReply: false,
            lastSellerReplyAt: input.sentAt,
            lastActivityAt: input.sentAt,
            buyerDisplayName: buyerName,
          },
        })
        const occurredAt = input.sentAt.toISOString()
        const outboxConv = await tx.outboxEvent.create({
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
                patch: {
                  needsReply: false,
                  lastActivityAt: occurredAt,
                },
              },
            },
            status: "PENDING",
            nextAttemptAt: input.sentAt,
          },
        })
        return [outboxConv.id]
      }

      const next = applyIncomingMessageEffects(
        {
          id: conversation.id,
          needsReply: conversation.needsReply,
          isArchived: conversation.isArchived,
          isPinnedInAll: conversation.isPinnedInAll,
          snoozedUntil: conversation.snoozedUntil ? conversation.snoozedUntil.toISOString() : null,
          tagIds: [],
        },
        { direction: "IN" },
        input.sentAt,
      )

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          needsReply: next.needsReply,
          isArchived: next.isArchived,
          archivedAt: null,
          isPinnedInAll: next.isPinnedInAll,
          pinnedAt: null,
          lastIncomingAt: input.sentAt,
          lastActivityAt: input.sentAt,
          buyerDisplayName: buyerName,
        },
      })

      const occurredAt = input.sentAt.toISOString()
      const messageDto = {
        id: message.id,
        conversationId: message.conversationId,
        direction: message.direction,
        text: message.text,
        clientMessageId: message.clientMessageId ?? null,
        createdAt: message.createdAt.toISOString(),
        sentAt: message.sentAt ? message.sentAt.toISOString() : null,
        deliveryStatus: message.deliveryStatus,
        errorCode: message.errorCode ?? null,
        errorMessage: message.errorMessage ?? null,
      }

      const outboxMessage = await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          type: "message.new",
          aggregateId: message.id,
          payload: {
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            occurredAt,
            data: {
              conversationId: conversation.id,
              message: messageDto,
            },
          },
          status: "PENDING",
          nextAttemptAt: input.sentAt,
        },
      })

      const outboxConversation = await tx.outboxEvent.create({
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
              patch: {
                needsReply: next.needsReply,
                isArchived: next.isArchived,
                isPinnedInAll: next.isPinnedInAll,
                lastIncomingAt: occurredAt,
                lastActivityAt: occurredAt,
              },
            },
          },
          status: "PENDING",
          nextAttemptAt: input.sentAt,
        },
      })

      return [outboxMessage.id, outboxConversation.id]
    })

    if (outboxIds.length === 0) return
    await this.enqueueOutbox(outboxIds)
  }

  private async enqueueOutbox(outboxEventIds: string[]): Promise<void> {
    for (const outboxEventId of outboxEventIds) {
      try {
        await this.outboxQueue.add(
          "process",
          { outboxEventId },
          { removeOnComplete: true, removeOnFail: true },
        )
      } catch (err: unknown) {
        this.logger.warn({ outboxEventId, err }, "channelSync.rozetka: failed to enqueue outbox event")
      }
    }
  }
}

class RozetkaApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
    readonly bodyExcerpt: string,
  ) {
    super(`ROZETKA HTTP ${status}${code != null ? ` (${code})` : ""}`)
  }
}

function parseRozetkaTimestamp(value: string | null | undefined): Date | null {
  if (!value || typeof value !== "string") return null
  // Rozetka returns "YYYY-MM-DD HH:MM:SS" naive (UA local). The previous version
  // used a hardcoded "+02:00" which is wrong half the year — Ukraine switches to
  // EEST (+03:00) from the last Sunday of March to the last Sunday of October.
  // We resolve the actual Europe/Kyiv offset for each instant via Intl.
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, ys, mos, ds, hs, mis, ss] = m as unknown as [string, string, string, string, string, string, string]
  const y = Number(ys),
    mo = Number(mos),
    d = Number(ds),
    h = Number(hs),
    mi = Number(mis),
    s = Number(ss)
  // Probe: assume the input was UTC. Then read what that instant LOOKS LIKE in
  // Europe/Kyiv. The wall-clock difference IS the offset for that instant.
  const probe = Date.UTC(y, mo - 1, d, h, mi, s)
  if (!Number.isFinite(probe)) return null
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  const parts = fmt.formatToParts(new Date(probe))
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? "0")
  const kyivAsIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  const offsetMs = kyivAsIfUtc - probe
  return new Date(probe - offsetMs)
}

function formatRozetkaTimestamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ")
}

function buildExternalMessageId(chatId: number, rawCreated: string, msgIndex: number): string {
  // Rozetka's public message response has no stable id. We synthesize a
  // composite that's unique per chat: <chatId>-<YYYYMMDDHHMMSS>-<msgIndex>.
  // msgIndex is the position in the chat's messages[] array; combined with
  // chatId+timestamp it disambiguates messages that share the same second.
  const compact = rawCreated.replace(/[^0-9]/g, "").slice(0, 14)
  return `${chatId}-${compact}-${msgIndex}`
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
