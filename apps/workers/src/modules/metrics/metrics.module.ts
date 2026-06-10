import { Module } from "@nestjs/common"

import { QueueModule } from "../queue/queue.module"
import { PrismaModule } from "../prisma/prisma.module"
import { MetricsPoller } from "./metrics.poller"
import { PrometheusController } from "./prometheus.controller"
import { PrometheusService } from "./prometheus.service"
import { WorkspaceDailyRollupProcessor } from "./workspace-daily-rollup.processor"

@Module({
  imports: [QueueModule, PrismaModule],
  controllers: [PrometheusController],
  providers: [MetricsPoller, WorkspaceDailyRollupProcessor, PrometheusService],
})
export class MetricsModule {}
