import { Module } from "@nestjs/common"

import { QueueModule } from "../queue/queue.module"
import { PrismaModule } from "../prisma/prisma.module"
import { ChannelSyncPoller } from "./channel-sync.poller"
import { ChannelSyncProcessor } from "./channel-sync.processor"
import { PromChannelSyncProcessor } from "./prom-channel-sync.processor"
import { PromChannelSyncService } from "./prom-channel-sync.service"
import { RozetkaChannelSyncProcessor } from "./rozetka-channel-sync.processor"
import { RozetkaChannelSyncService } from "./rozetka-channel-sync.service"
import { RozetkaOrderSyncProcessor } from "./rozetka-order-sync.processor"
import { RozetkaOrderSyncService } from "./rozetka-order-sync.service"
import { OlxUaSyncProcessor } from "./olx-ua-sync.processor"
import { OlxUaSyncService } from "./olx-ua-sync.service"

@Module({
  imports: [QueueModule, PrismaModule],
  providers: [
    ChannelSyncPoller,
    ChannelSyncProcessor,
    PromChannelSyncProcessor,
    PromChannelSyncService,
    RozetkaChannelSyncProcessor,
    RozetkaChannelSyncService,
    RozetkaOrderSyncProcessor,
    RozetkaOrderSyncService,
    OlxUaSyncProcessor,
    OlxUaSyncService,
  ],
})
export class ChannelSyncModule {}

