import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createClient, type RedisClientType } from "redis"

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private client: RedisClientType

  constructor(private readonly config: ConfigService) {
    // See apps/api/src/modules/redis/redis.service.ts for why we set
    // socket.keepAlive + pingInterval -- DO Managed Redis drops idle TLS
    // connections without them, producing constant ERROR-level reconnect noise.
    this.client = createClient({
      url: config.getOrThrow<string>("REDIS_URL"),
      socket: { keepAlive: 5000 },
      pingInterval: 30_000,
    })
    this.attachRedisEventHandlers(this.client, "workers-redis-service")
  }

  async onModuleInit() {
    try {
      await this.client.connect()
    } catch (error) {
      this.logger.error("Failed to connect workers Redis client", this.formatError(error))
      throw error
    }
  }

  async onModuleDestroy() {
    try {
      if (!this.client.isOpen) return
      await this.client.quit()
    } catch {
      // Best-effort shutdown.
    }
  }

  getClient(): RedisClientType {
    return this.client
  }

  async ping(): Promise<string> {
    return this.client.ping()
  }

  private attachRedisEventHandlers(client: RedisClientType, label: string) {
    client.on("error", (error) => {
      this.logger.error(`Redis client error (${label})`, this.formatError(error))
    })
    client.on("reconnecting", () => {
      this.logger.warn(`Redis client reconnecting (${label})`)
    })
    client.on("end", () => {
      this.logger.warn(`Redis client connection ended (${label})`)
    })
    client.on("ready", () => {
      this.logger.log(`Redis client ready (${label})`)
    })
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) return error.stack ?? error.message
    return String(error)
  }
}
