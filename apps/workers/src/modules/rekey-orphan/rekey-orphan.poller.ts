import { InjectQueue } from "@nestjs/bullmq"
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { Queue } from "bullmq"

@Injectable()
export class RekeyOrphanPoller implements OnModuleInit, OnModuleDestroy {
  private interval?: NodeJS.Timeout

  constructor(
    private readonly config: ConfigService,
    @InjectQueue("rekey-orphan") private readonly queue: Queue,
  ) {}

  onModuleInit() {
    const sec = Number(this.config.get<string>("REKEY_ORPHAN_INTERVAL_SEC") ?? 86_400)
    this.interval = setInterval(() => void this.tick(), sec * 1000)
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval)
  }

  private async tick(): Promise<void> {
    const dayKey = new Date().toISOString().slice(0, 10)
    try {
      await this.queue.add(
        "rekeyOrphanVersions",
        {},
        {
          // BullMQ forbids `:` in custom job ids. See maintenance.poller.ts.
          jobId: `rekeyOrphanVersions-${dayKey}`,
          removeOnComplete: true,
          removeOnFail: true,
        },
      )
    } catch (err: unknown) {
      const msg = String((err as any)?.message ?? err).toLowerCase()
      if (!(msg.includes("job") && msg.includes("exist"))) throw err
    }
  }
}
