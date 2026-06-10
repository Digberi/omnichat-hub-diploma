import { Processor, WorkerHost } from "@nestjs/bullmq"
import * as Sentry from "@sentry/node"
import type { Job } from "bullmq"
import { withQueueSpan } from "@omnichat/observability/node"

import { OlxUaSyncService } from "./olx-ua-sync.service"

@Processor("channelSync.olx")
export class OlxUaSyncProcessor extends WorkerHost {
  constructor(private readonly olxSync: OlxUaSyncService) {
    super()
  }

  async process(job: Job): Promise<void> {
    try {
      await withQueueSpan(
        {
          name: "workers.channel_sync.olx.process",
          attributes: {
            "messaging.system": "bullmq",
            "messaging.destination": "channelSync.olx",
            "messaging.job_name": job.name,
          },
        },
        async () => {
          if (job.name === "olxTick") {
            await this.olxSync.runTick()
          }
        },
      )
    } catch (err: unknown) {
      Sentry.captureException(err, {
        tags: { "workers.module": "channel_sync", "workers.action": "process_olx_job" },
        extra: { jobName: job.name },
      })
      throw err
    }
  }
}
