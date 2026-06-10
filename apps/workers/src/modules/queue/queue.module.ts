import { Module } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { BullModule } from "@nestjs/bullmq"

type BullRedisConnection = {
  host: string
  port: number
  username?: string
  password?: string
  tls?: Record<string, never>
}

function parseRedisUrl(redisUrl: string): BullRedisConnection {
  const url = new URL(redisUrl)
  const out: BullRedisConnection = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
  }
  if (url.username) out.username = url.username
  if (url.password) out.password = url.password
  if (url.protocol === "rediss:") out.tls = {}
  return out
}

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.getOrThrow<string>("REDIS_URL")
        const nodeEnv = String(config.get("NODE_ENV") ?? "development")
        const prefixRaw = String(config.get("BULLMQ_PREFIX") ?? "").trim()
        const prefix = prefixRaw.length > 0 ? prefixRaw : `omnichat:${nodeEnv}`
        const conn = parseRedisUrl(redisUrl)
        return {
          connection: conn,
          prefix,
        }
      },
    }),
    BullModule.registerQueue(
      { name: "outbox.process" },
      { name: "maintenance" },
      { name: "metrics.rollup.daily" },
      { name: "channelSync" },
      { name: "channelSync.olx" },
      { name: "channelSync.prom" },
      { name: "channelSync.rozetka" },
      { name: "channelSync.rozetka.orders" },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
