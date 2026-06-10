import { Processor, WorkerHost } from "@nestjs/bullmq"
import * as Sentry from "@sentry/node"
import type { Job } from "bullmq"
import { ConfigService } from "@nestjs/config"
import { randomUUID } from "crypto"
import { PinoLogger } from "nestjs-pino"
import { withQueueSpan } from "@omnichat/observability/node"

import { PrismaService } from "../prisma/prisma.service"
import { RealtimeEmitterService } from "../realtime-emitter/realtime-emitter.service"
import { PushService } from "../push/push.service"

@Processor("outbox.process", { concurrency: 10 })
export class OutboxProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emitter: RealtimeEmitterService,
    private readonly push: PushService,
    private readonly logger: PinoLogger,
  ) {
    super()
  }

  async process(job: Job<{ outboxEventId: string }>): Promise<void> {
    const outboxEventId = job.data.outboxEventId
    await withQueueSpan(
      {
        name: "workers.outbox.process",
        attributes: { "messaging.system": "bullmq", "messaging.destination": "outbox.process" },
      },
      async () => {
        const now = new Date()
        const lockId = randomUUID()
        const maxAttempts = this.config.get<number>("OUTBOX_MAX_ATTEMPTS") ?? 10
        const lockTtlSec = this.config.get<number>("OUTBOX_LOCK_TTL_SEC") ?? 300
        const staleBefore = new Date(Date.now() - lockTtlSec * 1000)

        const locked = await this.prisma.outboxEvent.updateMany({
          where: {
            id: outboxEventId,
            status: { in: ["PENDING", "FAILED", "PROCESSING"] },
            nextAttemptAt: { lte: now },
            attempts: { lt: maxAttempts },
            OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
          },
          data: {
            status: "PROCESSING",
            lockedAt: now,
            lockId,
            attempts: { increment: 1 },
            lastError: null,
          },
        })

        if (locked.count === 0) {
          return
        }

        const event = await this.prisma.outboxEvent.findUnique({ where: { id: outboxEventId } })
        if (!event) return

        try {
          // Delivery #1: websocket (baseline).
          if (!event.wsDeliveredAt) {
            this.emitter.emitToWorkspace(event.workspaceId, event.type, event.payload)
            await this.prisma.outboxEvent.update({
              where: { id: outboxEventId },
              data: { wsDeliveredAt: new Date() },
            })
          }

          // Delivery #2: push (optional; depends on event type & prefs).
          if (!event.pushDeliveredAt) {
            const pushed = await this.push.deliverForOutboxEvent(event)
            if (pushed) {
              await this.prisma.outboxEvent.update({
                where: { id: outboxEventId },
                data: { pushDeliveredAt: new Date() },
              })
            }
          }

          await this.prisma.outboxEvent.update({
            where: { id: outboxEventId },
            data: {
              status: "PROCESSED",
              processedAt: new Date(),
              lockedAt: null,
              lockId: null,
              lastError: null,
            },
          })
        } catch (err: any) {
          const attempts = event.attempts
          const backoffSec = Math.min(60 * 60, Math.pow(2, Math.min(10, attempts))) // cap at 1h
          const nextAttemptAt = new Date(Date.now() + backoffSec * 1000)

          this.logger.error({ err, outboxEventId }, "outbox processing failed")
          Sentry.captureException(err, {
            tags: { "workers.module": "outbox", "workers.action": "process_event" },
            extra: {
              outboxEventId,
              outboxType: event.type,
              attempts: event.attempts,
            },
          })

          await this.prisma.outboxEvent.update({
            where: { id: outboxEventId },
            data: {
              status: "FAILED",
              lockedAt: null,
              lockId: null,
              lastError: String(err?.message ?? err),
              nextAttemptAt,
            },
          })
        }
      },
    )
  }
}
