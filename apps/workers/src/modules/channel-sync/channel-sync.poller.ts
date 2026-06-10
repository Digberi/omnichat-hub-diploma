import { InjectQueue } from "@nestjs/bullmq"
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import * as Sentry from "@sentry/node"
import type { Queue } from "bullmq"

@Injectable()
export class ChannelSyncPoller implements OnModuleInit, OnModuleDestroy {
  private interval?: NodeJS.Timeout

  constructor(
    private readonly config: ConfigService,
    @InjectQueue("channelSync") private readonly queue: Queue,
    @InjectQueue("channelSync.olx") private readonly olxQueue: Queue,
    @InjectQueue("channelSync.prom") private readonly promQueue: Queue,
    @InjectQueue("channelSync.rozetka") private readonly rozetkaQueue: Queue,
    @InjectQueue("channelSync.rozetka.orders") private readonly rozetkaOrdersQueue: Queue,
  ) {}

  onModuleInit() {
    const stubEnabled = this.isEnabled("CHANNEL_SYNC_STUB_ENABLED")
    const olxEnabled = this.isEnabled("CHANNEL_SYNC_OLX_ENABLED")
    const promEnabled = this.isEnabled("CHANNEL_SYNC_PROM_ENABLED")
    const rozetkaEnabled = this.isEnabled("CHANNEL_SYNC_ROZETKA_ENABLED")
    const rozetkaOrdersEnabled = this.isEnabled("CHANNEL_SYNC_ROZETKA_ORDERS_ENABLED")
    if (!stubEnabled && !olxEnabled && !promEnabled && !rozetkaEnabled && !rozetkaOrdersEnabled) return

    const sec = this.config.get<number>("CHANNEL_SYNC_INTERVAL_SEC") ?? 60
    this.interval = setInterval(() => void this.tick(), sec * 1000)
    void this.tick()
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval)
  }

  private isDuplicateJobError(err: unknown): boolean {
    const msg = String((err as any)?.message ?? err).toLowerCase()
    return msg.includes("job") && msg.includes("exist")
  }

  private isEnabled(key: string): boolean {
    const raw = this.config.get<unknown>(key)
    if (typeof raw === "boolean") return raw
    if (typeof raw === "number") return raw !== 0
    if (typeof raw === "string") {
      const v = raw.trim().toLowerCase()
      if (v === "1" || v === "true" || v === "yes" || v === "on") return true
      if (v === "0" || v === "false" || v === "no" || v === "off") return false
    }
    return false
  }

  private async enqueue(jobName: string, queue: Queue = this.queue): Promise<void> {
    try {
      await queue.add(
        jobName,
        {},
        {
          jobId: jobName,
          removeOnComplete: true,
          removeOnFail: true,
        },
      )
    } catch (err: unknown) {
      if (!this.isDuplicateJobError(err)) throw err
    }
  }

  private async tick(): Promise<void> {
    try {
      if (this.isEnabled("CHANNEL_SYNC_STUB_ENABLED")) {
        await this.enqueue("stubTick")
      }
      if (this.isEnabled("CHANNEL_SYNC_OLX_ENABLED")) {
        await this.enqueue("olxTick", this.olxQueue)
      }
      if (this.isEnabled("CHANNEL_SYNC_PROM_ENABLED")) {
        await this.enqueue("promTick", this.promQueue)
      }
      if (this.isEnabled("CHANNEL_SYNC_ROZETKA_ENABLED")) {
        await this.enqueue("rozetkaTick", this.rozetkaQueue)
      }
      if (this.isEnabled("CHANNEL_SYNC_ROZETKA_ORDERS_ENABLED")) {
        await this.enqueue("rozetkaOrdersTick", this.rozetkaOrdersQueue)
      }
    } catch (err: unknown) {
      Sentry.captureException(err, {
        tags: { "workers.module": "channel_sync", "workers.action": "poller_tick" },
      })
    }
  }
}
