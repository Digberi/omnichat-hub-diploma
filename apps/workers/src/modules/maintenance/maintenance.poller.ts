import { InjectQueue } from "@nestjs/bullmq"
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import * as Sentry from "@sentry/node"
import type { Queue } from "bullmq"

@Injectable()
export class MaintenancePoller implements OnModuleInit, OnModuleDestroy {
  private interval?: NodeJS.Timeout

  constructor(
    private readonly config: ConfigService,
    @InjectQueue("maintenance") private readonly queue: Queue,
  ) {}

  onModuleInit() {
    const sec = this.config.get<number>("MAINTENANCE_INTERVAL_SEC") ?? 60
    this.interval = setInterval(() => void this.tick(), sec * 1000)
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval)
  }

  private isDuplicateJobError(err: unknown): boolean {
    const msg = String((err as any)?.message ?? err).toLowerCase()
    return msg.includes("job") && msg.includes("exist")
  }

  private async tick(): Promise<void> {
    try {
      try {
        await this.queue.add(
          "cleanupExpiredShortLinks",
          {},
          {
            jobId: "cleanupExpiredShortLinks",
            removeOnComplete: true,
            removeOnFail: true,
          },
        )
      } catch (err: unknown) {
        if (!this.isDuplicateJobError(err)) throw err
      }

      // Auto-archive runs at most once per hour (by jobId).
      const hourKey = new Date().toISOString().slice(0, 13) // YYYY-MM-DDTHH
      try {
        await this.queue.add(
          "autoArchiveConversations",
          {},
          {
            // BullMQ forbids `:` in custom job ids (it's the Redis key
            // separator: bull:<queue>:<job-id>). Use `-` so the dedup window
            // (one job per hour) still works without raising every tick.
            jobId: `autoArchiveConversations-${hourKey}`,
            removeOnComplete: true,
            removeOnFail: true,
          },
        )
      } catch (err: unknown) {
        if (!this.isDuplicateJobError(err)) throw err
      }
    } catch (err: unknown) {
      Sentry.captureException(err, {
        tags: { "workers.module": "maintenance", "workers.action": "poller_tick" },
      })
    }
  }
}
