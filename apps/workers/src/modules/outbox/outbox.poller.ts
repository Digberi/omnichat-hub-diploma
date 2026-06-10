import { InjectQueue } from "@nestjs/bullmq"
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import * as Sentry from "@sentry/node"
import type { Queue } from "bullmq"
import { PinoLogger } from "nestjs-pino"

import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class OutboxPoller implements OnModuleInit, OnModuleDestroy {
  private interval?: NodeJS.Timeout
  private lastBacklogSignalAt = 0

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @InjectQueue("outbox.process") private readonly queue: Queue,
  ) {}

  onModuleInit() {
    const nodeEnv = String(this.config.get("NODE_ENV") ?? "development")
    // In test runs, we want fast recovery for any lost/failed outbox jobs (CI + local e2e).
    // In production, this is a recovery mechanism (not the primary delivery path), so default can stay higher.
    const sec =
      process.env.OUTBOX_POLL_INTERVAL_SEC !== undefined
        ? (this.config.get<number>("OUTBOX_POLL_INTERVAL_SEC") ?? 60)
        : nodeEnv === "test"
          ? 1
          : (this.config.get<number>("OUTBOX_POLL_INTERVAL_SEC") ?? 60)

    this.interval = setInterval(() => void this.tick(), sec * 1000)
    void this.tick()
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval)
  }

  private async tick(): Promise<void> {
    try {
      const now = new Date()
      const maxAttempts = this.config.get<number>("OUTBOX_MAX_ATTEMPTS") ?? 10
      const lockTtlSec = this.config.get<number>("OUTBOX_LOCK_TTL_SEC") ?? 300
      const staleBefore = new Date(Date.now() - lockTtlSec * 1000)
      const backlogWarn = this.config.get<number>("SENTRY_OUTBOX_BACKLOG_WARN") ?? 200
      const backlogCooldownSec = this.config.get<number>("SENTRY_OUTBOX_BACKLOG_COOLDOWN_SEC") ?? 300

      const pending = await this.prisma.outboxEvent.findMany({
        where: {
          status: { in: ["PENDING", "FAILED", "PROCESSING"] },
          nextAttemptAt: { lte: now },
          attempts: { lt: maxAttempts },
          OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
        },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: { id: true },
      })

      if (pending.length === 0) return

      await Promise.all(
        pending.map((e: { id: string }) =>
          this.queue.add(
            "process",
            { outboxEventId: e.id },
            {
              removeOnComplete: true,
              removeOnFail: true,
            },
          ),
        ),
      )

      if (pending.length >= backlogWarn) {
        const nowMs = Date.now()
        if (nowMs - this.lastBacklogSignalAt >= backlogCooldownSec * 1000) {
          this.lastBacklogSignalAt = nowMs
          this.logger.warn(
            {
              "workers.module": "outbox",
              "workers.action": "poller_backlog_warning",
              pendingCount: pending.length,
              backlogWarn,
              backlogCooldownSec,
            },
            "Outbox backlog is high",
          )
          // Production alerting (SENTRY_OUTBOX_*) depends on this signal.
          // The pino warn above goes to Loki for correlation; the Sentry
          // capture triggers paging. Both must remain.
          Sentry.captureMessage("Outbox backlog is high", {
            level: "warning",
            tags: { "workers.module": "outbox", "workers.action": "poller_backlog_warning" },
            extra: {
              pendingCount: pending.length,
              backlogWarn,
              backlogCooldownSec,
            },
          })
        }
      }

      this.logger.info({ count: pending.length }, "outbox poller enqueued events")
    } catch (err: unknown) {
      this.logger.error({ err }, "outbox poller tick failed")
      Sentry.captureException(err, {
        tags: { "workers.module": "outbox", "workers.action": "poller_tick" },
      })
    }
  }
}
