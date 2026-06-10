import { Module } from "@nestjs/common"
import { ThrottlerModule } from "@nestjs/throttler"
import { KmsModule } from "@omnichat/kms/nest"
import { ObservabilityModule } from "@omnichat/observability/nest"

import { AppConfigModule } from "./modules/config/config.module"
import { LoggingModule } from "./modules/logging/logging.module"
import { PrismaModule } from "./modules/prisma/prisma.module"
import { PrismaService } from "./modules/prisma/prisma.service"
import { RedisModule } from "./modules/redis/redis.module"
import { HealthModule } from "./modules/health/health.module"
import { AuthModule } from "./modules/auth/auth.module"
import { RealtimeModule } from "./modules/realtime/realtime.module"
import { ConversationsModule } from "./modules/conversations/conversations.module"
import { MessagesModule } from "./modules/messages/messages.module"
import { QueueModule } from "./modules/queue/queue.module"
import { TagsModule } from "./modules/tags/tags.module"
import { StatusesModule } from "./modules/statuses/statuses.module"
import { WorkspacesModule } from "./modules/workspaces/workspaces.module"
import { SettingsModule } from "./modules/settings/settings.module"
import { ChannelAccountsModule } from "./modules/channel-accounts/channel-accounts.module"
import { PromModule } from "./modules/prom/prom.module"
import { RozetkaModule } from "./modules/rozetka/rozetka.module"
import { NotificationsModule } from "./modules/notifications/notifications.module"
import { SearchModule } from "./modules/search/search.module"
import { TemplatesModule } from "./modules/templates/templates.module"
import { StorageModule } from "./modules/storage/storage.module"
import { AttachmentsModule } from "./modules/attachments/attachments.module"
import { ShortLinksModule } from "./modules/shortlinks/shortlinks.module"
import { MetricsModule } from "./modules/metrics/metrics.module"
import { DebugModule } from "./modules/debug/debug.module"

@Module({
  imports: [
    ObservabilityModule.forRoot({ serviceName: "omnichat-api" }),
    AppConfigModule,
    LoggingModule,
    ThrottlerModule.forRoot({
      // Apply ThrottlerGuard only on selected endpoints (auth).
      // Skip in non-production to keep DX and tests stable.
      skipIf: () => (process.env.NODE_ENV ?? "development") !== "production",
      throttlers: [{ name: "auth", ttl: 60, limit: 20, blockDuration: 60 }],
      setHeaders: true,
    }),
    PrismaModule,
    KmsModule.forRoot({ prismaService: PrismaService, imports: [PrismaModule] }),
    RedisModule,
    QueueModule,
    HealthModule,
    AuthModule,
    RealtimeModule,
    ConversationsModule,
    MessagesModule,
    TagsModule,
    StatusesModule,
    WorkspacesModule,
    SettingsModule,
    ChannelAccountsModule,
    PromModule,
    RozetkaModule,
    NotificationsModule,
    SearchModule,
    TemplatesModule,
    StorageModule,
    AttachmentsModule,
    ShortLinksModule,
    MetricsModule,
    DebugModule,
  ],
})
export class AppModule {}
