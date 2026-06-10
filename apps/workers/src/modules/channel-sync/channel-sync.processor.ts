import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq"
import * as Sentry from "@sentry/node"
import type { Job, Queue } from "bullmq"
import { Inject } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { PinoLogger } from "nestjs-pino"
import { randomUUID } from "crypto"
import { applyIncomingMessageEffects } from "@omnichat/domain"
import { Prisma } from "@omnichat/db"
import { withQueueSpan } from "@omnichat/observability/node"
import { ENVELOPE_CRYPTO } from "@omnichat/kms/nest"
import type { EnvelopeCryptoService } from "@omnichat/kms"

import { PrismaService } from "../prisma/prisma.service"

function pickStubText(): string {
  const texts = [
    "Доброго дня! Є в наявності?",
    "Підкажіть, будь ласка, по доставці.",
    "Можна відправити сьогодні?",
    "Які реквізити для оплати?",
    "Дякую! Чекаю відповідь.",
  ]
  return texts[Math.floor(Math.random() * texts.length)] ?? "Новe повідомлення"
}

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

function firstObject(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const record = asRecord(value)
    if (record) return record
  }
  return null
}

type OlxAuthData = {
  accessToken: string
  refreshToken?: string | null
}

type NormalizedOlxIncomingMessage = {
  externalMessageId: string
  externalConversationId: string
  direction: "IN" | "OUT"
  text: string | null
  sentAt: Date
  buyerDisplayName: string
  externalBuyerId: string | null
  buyerAvatarUrl: string | null
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

@Processor("channelSync")
export class ChannelSyncProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue("outbox.process") private readonly outboxQueue: Queue,
    private readonly logger: PinoLogger,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCryptoService,
  ) {
    super()
  }

  private getBoolean(key: string, fallback = false): boolean {
    const raw = this.config.get<unknown>(key)
    if (typeof raw === "boolean") return raw
    if (typeof raw === "number") return raw !== 0
    if (typeof raw === "string") {
      const value = raw.trim().toLowerCase()
      if (value === "1" || value === "true" || value === "yes" || value === "on") return true
      if (value === "0" || value === "false" || value === "no" || value === "off") return false
    }
    return fallback
  }

  private getPositiveInt(key: string, fallback: number): number {
    const raw = this.config.get<unknown>(key)
    const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return Math.floor(parsed)
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
        // Outbox poller will recover pending events.
        this.logger.warn({ outboxEventId, err }, "channelSync: failed to enqueue outbox event")
      }
    }
  }


  private async runStubTick(): Promise<void> {
    const enabled = this.getBoolean("CHANNEL_SYNC_STUB_ENABLED", false)
    if (!enabled) return

    const maxAccounts = this.getPositiveInt("CHANNEL_SYNC_STUB_MAX_ACCOUNTS", 3)
    const accounts = await this.prisma.channelAccount.findMany({
      where: { isEnabled: true },
      select: { id: true },
      take: maxAccounts,
    })
    if (accounts.length === 0) return

    for (const account of accounts) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { channelAccountId: account.id },
        orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          workspaceId: true,
          needsReply: true,
          isArchived: true,
          isPinnedInAll: true,
          snoozedUntil: true,
        },
      })
      if (!conversation) continue

      const now = new Date()
      const externalMessageId = `stub_${randomUUID()}`
      const text = pickStubText()

      const outboxIds = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const message = await tx.message.create({
          data: {
            workspaceId: conversation.workspaceId,
            conversationId: conversation.id,
            externalMessageId,
            direction: "IN",
            text,
            sentAt: now,
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
            workspaceId: conversation.workspaceId,
            type: "message.new",
            aggregateId: message.id,
            payload: {
              schemaVersion: 1,
              workspaceId: conversation.workspaceId,
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
            workspaceId: conversation.workspaceId,
            type: "conversation.updated",
            aggregateId: conversation.id,
            payload: {
              schemaVersion: 1,
              workspaceId: conversation.workspaceId,
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

      await this.enqueueOutbox(outboxIds)

      this.logger.info(
        { channelAccountId: account.id, conversationId: conversation.id, outbox: outboxIds.length },
        "channelSync: stub message created",
      )
    }
  }


  async process(job: Job): Promise<void> {
    try {
      await withQueueSpan(
        {
          name: "workers.channel_sync.process",
          attributes: {
            "messaging.system": "bullmq",
            "messaging.destination": "channelSync",
            "messaging.job_name": job.name,
          },
        },
        async () => {
          if (job.name === "stubTick") {
            await this.runStubTick()
            return
          }
        },
      )
    } catch (err: unknown) {
      Sentry.captureException(err, {
        tags: { "workers.module": "channel_sync", "workers.action": "process_job" },
        extra: { jobName: job.name },
      })
      throw err
    }
  }
}
