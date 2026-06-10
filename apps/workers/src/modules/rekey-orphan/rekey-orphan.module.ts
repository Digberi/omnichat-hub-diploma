import { BullModule } from "@nestjs/bullmq"
import { Module } from "@nestjs/common"

import { QueueModule } from "../queue/queue.module"
import { PrismaModule } from "../prisma/prisma.module"
import { RekeyOrphanPoller } from "./rekey-orphan.poller"
import { RekeyOrphanProcessor } from "./rekey-orphan.processor"

@Module({
  imports: [QueueModule, PrismaModule, BullModule.registerQueue({ name: "rekey-orphan" })],
  providers: [RekeyOrphanPoller, RekeyOrphanProcessor],
})
export class RekeyOrphanModule {}
