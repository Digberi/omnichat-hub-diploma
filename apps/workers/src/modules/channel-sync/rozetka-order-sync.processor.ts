import { Processor, WorkerHost } from "@nestjs/bullmq"
import * as Sentry from "@sentry/node"
import type { Job } from "bullmq"
import { withQueueSpan } from "@omnichat/observability/node"

import { RozetkaOrderSyncService } from "./rozetka-order-sync.service"

@Processor("channelSync.rozetka.orders")
export class RozetkaOrderSyncProcessor extends WorkerHost {
  constructor(private readonly orderSync: RozetkaOrderSyncService) {
    super()
  }

  async process(job: Job): Promise<void> {
    try {
      await withQueueSpan(
        {
          name: "workers.channel_sync.rozetka_orders.process",
          attributes: {
            "messaging.system": "bullmq",
            "messaging.destination": "channelSync.rozetka.orders",
            "messaging.job_name": job.name,
          },
        },
        async () => {
          if (job.name === "rozetkaOrdersTick") {
            await this.orderSync.runTick()
          }
        },
      )
    } catch (err: unknown) {
      Sentry.captureException(err, {
        tags: { "workers.module": "channel_sync", "workers.action": "process_rozetka_orders_job" },
        extra: { jobName: job.name },
      })
      throw err
    }
  }
}
