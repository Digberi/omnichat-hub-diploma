import { Module } from "@nestjs/common"

import { QueueModule } from "../queue/queue.module"
import { PrismaModule } from "../prisma/prisma.module"
import { MaintenancePoller } from "./maintenance.poller"
import { MaintenanceProcessor } from "./maintenance.processor"

@Module({
  imports: [QueueModule, PrismaModule],
  providers: [MaintenancePoller, MaintenanceProcessor],
})
export class MaintenanceModule {}

