import { Module } from "@nestjs/common"

import { QueueModule } from "../queue/queue.module"
import { PrismaModule } from "../prisma/prisma.module"
import { PushModule } from "../push/push.module"
import { RealtimeEmitterModule } from "../realtime-emitter/realtime-emitter.module"
import { OutboxProcessor } from "./outbox.processor"
import { OutboxPoller } from "./outbox.poller"

@Module({
  imports: [QueueModule, PrismaModule, RealtimeEmitterModule, PushModule],
  providers: [OutboxProcessor, OutboxPoller],
})
export class OutboxModule {}
