import { InjectQueue } from "@nestjs/bullmq"
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import * as Sentry from "@sentry/node"
import type { Queue } from "bullmq"

function toIsoDateUtc(d: Date): string {
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

@Injectable()
export class MetricsPoller implements OnModuleInit, OnModuleDestroy {
  private interval?: NodeJS.Timeout

  constructor(
    private readonly config: ConfigService,
    @InjectQueue("metrics.rollup.daily") private readonly queue: Queue,
  ) {}

  onModuleInit() {
    const sec = this.config.get<number>("METRICS_ROLLUP_INTERVAL_SEC") ?? 3600
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
      const date = toIsoDateUtc(new Date())
      try {
        await this.queue.add(
          "rollup",
          { date },
          {
            // BullMQ forbids `:` in custom job ids (Redis key separator).
            // Use `-` so per-day dedup still works without raising every tick.
            jobId: `rollup-${date}`,
            removeOnComplete: true,
            removeOnFail: true,
          },
        )
      } catch (err: unknown) {
        if (!this.isDuplicateJobError(err)) throw err
      }
    } catch (err: unknown) {
      Sentry.captureException(err, {
        tags: { "workers.module": "metrics", "workers.action": "poller_tick" },
      })
    }
  }
}
