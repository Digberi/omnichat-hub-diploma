import { Processor, WorkerHost } from "@nestjs/bullmq"
import * as Sentry from "@sentry/node"
import type { Job } from "bullmq"
import { withQueueSpan } from "@omnichat/observability/node"

import { RozetkaChannelSyncService } from "./rozetka-channel-sync.service"

@Processor("channelSync.rozetka")
export class RozetkaChannelSyncProcessor extends WorkerHost {
  constructor(private readonly rozetkaSync: RozetkaChannelSyncService) {
    super()
  }

  async process(job: Job): Promise<void> {
    try {
      await withQueueSpan(
        {
          name: "workers.channel_sync.rozetka.process",
          attributes: {
            "messaging.system": "bullmq",
            "messaging.destination": "channelSync.rozetka",
            "messaging.job_name": job.name,
          },
        },
        async () => {
          if (job.name === "rozetkaTick") {
            await this.rozetkaSync.runTick()
          }
        },
      )
    } catch (err: unknown) {
      Sentry.captureException(err, {
        tags: { "workers.module": "channel_sync", "workers.action": "process_rozetka_job" },
        extra: { jobName: job.name },
      })
      throw err
    }
  }
}
