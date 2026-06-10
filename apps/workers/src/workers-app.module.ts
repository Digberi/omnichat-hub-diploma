import { Module } from "@nestjs/common"
import { ObservabilityModule } from "@omnichat/observability/nest"
import { KmsModule } from "@omnichat/kms/nest"

import { AppConfigModule } from "./modules/config/config.module"
import { LoggingModule } from "./modules/logging/logging.module"
import { PrismaModule } from "./modules/prisma/prisma.module"
import { PrismaService } from "./modules/prisma/prisma.service"
import { RedisModule } from "./modules/redis/redis.module"
import { QueueModule } from "./modules/queue/queue.module"
import { RealtimeEmitterModule } from "./modules/realtime-emitter/realtime-emitter.module"
import { OutboxModule } from "./modules/outbox/outbox.module"
import { MaintenanceModule } from "./modules/maintenance/maintenance.module"
import { MetricsModule } from "./modules/metrics/metrics.module"
import { PushModule } from "./modules/push/push.module"
import { ChannelSyncModule } from "./modules/channel-sync/channel-sync.module"
import { HealthModule } from "./modules/health/health.module"
import { RekeyOrphanModule } from "./modules/rekey-orphan/rekey-orphan.module"

@Module({
  imports: [
    ObservabilityModule.forRoot({ serviceName: "omnichat-workers" }),
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    KmsModule.forRoot({ prismaService: PrismaService, imports: [PrismaModule] }),
    RedisModule,
    QueueModule,
    RealtimeEmitterModule,
    HealthModule,
    PushModule,
    OutboxModule,
    ChannelSyncModule,
    MaintenanceModule,
    MetricsModule,
    RekeyOrphanModule,
  ],
})
export class WorkersAppModule {}
