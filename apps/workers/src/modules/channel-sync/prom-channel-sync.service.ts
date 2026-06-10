import { InjectQueue } from "@nestjs/bullmq"
import { Injectable, Inject } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { Queue } from "bullmq"
import { PinoLogger } from "nestjs-pino"
import { applyIncomingMessageEffects } from "@omnichat/domain"
import { Prisma } from "@omnichat/db"
import { ENVELOPE_CRYPTO } from "@omnichat/kms/nest"
import type { EnvelopeCryptoService } from "@omnichat/kms"

import { PrismaService } from "../prisma/prisma.service"

type PromAuthData = {
  apiToken: string
  apiBaseUrl: string
}

type NormalizedPromIncomingMessage = {
  externalMessageId: string
  externalConversationId: string
  direction: "IN" | "OUT"
  text: string | null
  sentAt: Date
  buyerDisplayName: string
  externalBuyerId: string | null
}

const conversationStateSelect = {
  id: true,
  workspaceId: true,
  channel: true,
  channelAccountId: true,
  externalConversationId: true,
  externalBuyerId: true,
  buyerDisplayName: true,
  buyerAvatarUrl: true,
  needsReply: true,
  isArchived: true,
  isPinnedInAll: true,
  snoozedUntil: true,
} as const

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim()
  return v.length > 0 ? v : null
}

function safeDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value !== "string" && typeof value !== "number") return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = safeString(value)
    if (parsed) return parsed
  }
  return null
}

@Injectable()
export class PromChannelSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue("outbox.process") private readonly outboxQueue: Queue,
    private readonly logger: PinoLogger,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCryptoService,
  ) {}

  private getPositiveInt(key: string, fallback: number): number {
    const raw = this.config.get<unknown>(key)
    const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return Math.floor(parsed)
  }

  private getBoolean(key: string, fallback = false): boolean {
    const raw = this.config.get<unknown>(key)
    if (typeof raw === "boolean") return raw
    if (typeof raw === "number") return raw !== 0
    if (typeof raw === "string") {
      const value = raw.trim().toLowerCase()
      if (["1", "true", "yes", "on"].includes(value)) return true
      if (["0", "false", "no", "off"].includes(value)) return false
    }
    return fallback
  }

  private toPromDateString(value: Date): string {
    return value.toISOString().replace(/\.\d{3}Z$/, "")
  }

  private buildPromUrl(baseUrl: string, endpoint: string): URL {
    if (/^https?:\/\//i.test(endpoint)) return new URL(endpoint)
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
    const normalizedEndpoint = endpoint.replace(/^\/+/, "")
    return new URL(normalizedEndpoint, normalizedBase)
  }

  private inferProject(baseUrl: string): "promua" | "biglua" {
    return /bigl/i.test(baseUrl) ? "biglua" : "promua"
  }

  private extractMessages(raw: unknown): unknown[] {
    const root = asRecord(raw)
    const data = asRecord(root?.data)
    return Array.isArray(data?.messages) ? data.messages : []
  }

  private normalizePromMessage(raw: unknown): NormalizedPromIncomingMessage | null {
    const message = asRecord(raw)
    if (!message) return null

    const externalMessageId = firstString(message.id, safeNumber(message.id))
    const externalConversationId = firstString(message.room_ident, message.room_id)
    if (!externalMessageId || !externalConversationId) return null

    const direction: "IN" | "OUT" = message.is_sender === true ? "OUT" : "IN"
    const sentAt = safeDate(message.date_sent) ?? new Date()

    return {
      externalMessageId,
      externalConversationId,
      direction,
      text: safeString(message.body),
      sentAt,
      buyerDisplayName: firstString(message.user_name) ?? "PROM buyer",
      externalBuyerId: firstString(message.buyer_client_id, message.user_ident),
    }
  }

  private async enqueueOutbox(outboxIds: string[]): Promise<void> {
    for (const outboxEventId of outboxIds) {
      try {
        await this.outboxQueue.add(
          "process",
          { outboxEventId },
          {
            removeOnComplete: true,
            removeOnFail: true,
          },
        )
      } catch (err: unknown) {
        this.logger.warn({ outboxEventId, err }, "channelSync.prom: failed to enqueue outbox event")
      }
    }
  }

  private async persistIncomingMessage(input: {
    workspaceId: string
    channelAccountId: string
    message: NormalizedPromIncomingMessage
  }): Promise<{ processed: boolean }> {
    if (input.message.direction !== "IN") return { processed: false }

    const now = input.message.sentAt
    const outboxIds = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let conversation = await tx.conversation.findFirst({
        where: {
          workspaceId: input.workspaceId,
          channelAccountId: input.channelAccountId,
          externalConversationId: input.message.externalConversationId,
        },
        select: conversationStateSelect,
      })

      if (!conversation) {
        conversation = await tx.conversation.create({
          data: {
            workspaceId: input.workspaceId,
            channelAccountId: input.channelAccountId,
            channel: "PROM",
            externalConversationId: input.message.externalConversationId,
            externalBuyerId: input.message.externalBuyerId,
            buyerDisplayName: input.message.buyerDisplayName,
          },
          select: conversationStateSelect,
        })
      }

      const duplicate = await tx.message.findFirst({
        where: {
          conversationId: conversation.id,
          externalMessageId: input.message.externalMessageId,
        },
        select: { id: true },
      })
      if (duplicate) return [] as string[]

      const message = await tx.message.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          externalMessageId: input.message.externalMessageId,
          direction: "IN",
          text: input.message.text,
          sentAt: input.message.sentAt,
          deliveryStatus: "DELIVERED",
        },
      })

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
        now,
      )

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          needsReply: next.needsReply,
          isArchived: next.isArchived,
          archivedAt: null,
          isPinnedInAll: next.isPinnedInAll,
          pinnedAt: null,
          lastIncomingAt: now,
          lastActivityAt: now,
          buyerDisplayName: input.message.buyerDisplayName,
          ...(input.message.externalBuyerId ? { externalBuyerId: input.message.externalBuyerId } : {}),
        },
      })

      const occurredAt = now.toISOString()
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
          nextAttemptAt: now,
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
                lastIncomingAt: now.toISOString(),
                lastActivityAt: now.toISOString(),
              },
            },
          },
          status: "PENDING",
          nextAttemptAt: now,
        },
      })

      return [outboxMessage.id, outboxConversation.id]
    })

    if (outboxIds.length === 0) return { processed: false }

    await this.enqueueOutbox(outboxIds)
    return { processed: true }
  }

  async runTick(): Promise<void> {
    if (!this.getBoolean("CHANNEL_SYNC_PROM_ENABLED", false)) return

    const maxAccounts = this.getPositiveInt("CHANNEL_SYNC_PROM_MAX_ACCOUNTS", 50)
    const pageLimit = this.getPositiveInt("CHANNEL_SYNC_PROM_LIMIT", 100)
    const timeoutMs = this.getPositiveInt("PROM_REQUEST_TIMEOUT_MS", 8_000)

    const accounts = await this.prisma.channelAccount.findMany({
      where: {
        isEnabled: true,
        channel: "PROM",
        authType: "TOKEN",
        authDataEncrypted: { not: null },
      },
      select: {
        id: true,
        workspaceId: true,
        alias: true,
        authDataEncrypted: true,
        syncCheckpoint: {
          select: {
            lastMessageAt: true,
          },
        },
      },
      orderBy: [{ lastSyncAt: "asc" }, { id: "asc" }],
      take: maxAccounts,
    })

    if (accounts.length === 0) return

    for (const account of accounts) {
      const now = new Date()
      try {
        const auth = (await this.crypto.decrypt(account.workspaceId, String(account.authDataEncrypted))) as PromAuthData
        const url = this.buildPromUrl(auth.apiBaseUrl, "/chat/messages_history")
        const project = this.inferProject(auth.apiBaseUrl)
        const seenExternalIds = new Set<string>()
        let maxSentAt = account.syncCheckpoint?.lastMessageAt ?? null
        let processedIncoming = 0
        let offset = 0

        const since = account.syncCheckpoint?.lastMessageAt
        const dateFrom = since ? new Date(Math.max(0, since.getTime() - 1000)) : null

        while (true) {
          url.search = ""
          url.searchParams.set("limit", String(pageLimit))
          url.searchParams.set("offset", String(offset))
          url.searchParams.set("sort", "asc")
          url.searchParams.set("project", project)
          if (dateFrom) {
            url.searchParams.set("date_from", this.toPromDateString(dateFrom))
          }

          const response = await fetch(url, {
            method: "GET",
            headers: {
              accept: "application/json",
              authorization: `Bearer ${auth.apiToken}`,
              "X-LANGUAGE": "uk",
            },
            signal: AbortSignal.timeout(timeoutMs),
          })

          const bodyText = await response.text()
          if (!response.ok) {
            throw new Error(`PROM messages_history request failed (${response.status}): ${bodyText.slice(0, 240)}`)
          }

          let bodyJson: unknown
          try {
            bodyJson = JSON.parse(bodyText) as unknown
          } catch {
            throw new Error(`PROM messages_history response is not valid JSON: ${bodyText.slice(0, 240)}`)
          }

          const rows = this.extractMessages(bodyJson)
          for (const row of rows) {
            const normalized = this.normalizePromMessage(row)
            if (!normalized) continue
            if (seenExternalIds.has(normalized.externalMessageId)) continue
            seenExternalIds.add(normalized.externalMessageId)

            if (!maxSentAt || normalized.sentAt > maxSentAt) {
              maxSentAt = normalized.sentAt
            }

            const result = await this.persistIncomingMessage({
              workspaceId: account.workspaceId,
              channelAccountId: account.id,
              message: normalized,
            })
            if (result.processed) processedIncoming += 1
          }

          if (rows.length < pageLimit) break
          offset += rows.length
        }

        await this.prisma.channelSyncCheckpoint.upsert({
          where: { channelAccountId: account.id },
          update: {
            ...(maxSentAt ? { lastMessageAt: maxSentAt } : {}),
          },
          create: {
            channelAccountId: account.id,
            ...(maxSentAt ? { lastMessageAt: maxSentAt } : {}),
          },
        })

        await this.prisma.channelAccount.update({
          where: { id: account.id },
          data: {
            lastSyncAt: now,
            lastError: null,
          },
        })

        this.logger.info(
          { channelAccountId: account.id, alias: account.alias, processedIncoming },
          "channelSync: PROM sync completed",
        )
      } catch (err: unknown) {
        const errorMessage = String((err as any)?.message ?? err).slice(0, 1000)
        this.logger.error(
          { err, channelAccountId: account.id, workspaceId: account.workspaceId },
          "channelSync: PROM sync failed",
        )

        await this.prisma.channelAccount
          .update({
            where: { id: account.id },
            data: { lastError: errorMessage },
          })
          .catch(() => undefined)

        try {
          const outbox = await this.prisma.outboxEvent.create({
            data: {
              workspaceId: account.workspaceId,
              type: "sync.error",
              aggregateId: account.id,
              payload: {
                schemaVersion: 1,
                workspaceId: account.workspaceId,
                occurredAt: now.toISOString(),
                data: {
                  channelAccountId: account.id,
                  error: errorMessage,
                  at: now.toISOString(),
                },
              },
              status: "PENDING",
              nextAttemptAt: now,
            },
          })
          await this.enqueueOutbox([outbox.id])
        } catch {
          // Best effort: keep primary failure handling focused on account.lastError
        }
      }
    }
  }
}
