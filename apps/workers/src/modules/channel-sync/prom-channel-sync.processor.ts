import { Processor, WorkerHost } from "@nestjs/bullmq"
import * as Sentry from "@sentry/node"
import type { Job } from "bullmq"
import { withQueueSpan } from "@omnichat/observability/node"

import { PromChannelSyncService } from "./prom-channel-sync.service"

@Processor("channelSync.prom")
export class PromChannelSyncProcessor extends WorkerHost {
  constructor(private readonly promSync: PromChannelSyncService) {
    super()
  }

  async process(job: Job): Promise<void> {
    try {
      await withQueueSpan(
        {
          name: "workers.channel_sync.prom.process",
          attributes: {
            "messaging.system": "bullmq",
            "messaging.destination": "channelSync.prom",
            "messaging.job_name": job.name,
          },
        },
        async () => {
          if (job.name === "promTick") {
            await this.promSync.runTick()
          }
        },
      )
    } catch (err: unknown) {
      Sentry.captureException(err, {
        tags: { "workers.module": "channel_sync", "workers.action": "process_prom_job" },
        extra: { jobName: job.name },
      })
      throw err
    }
  }
}
