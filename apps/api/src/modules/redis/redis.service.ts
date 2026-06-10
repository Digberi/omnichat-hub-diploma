import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createClient, type RedisClientType } from "redis"

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private client: RedisClientType

  constructor(private readonly config: ConfigService) {
    this.client = createClient({
      url: config.getOrThrow<string>("REDIS_URL"),
      // DO Managed Redis (and any LB in front) drops idle TLS connections.
      // socket.keepAlive turns on TCP keepalive at 5s intervals; pingInterval
      // sends a Redis-level PING every 30s. Together these keep the socket
      // hot, eliminating the "Socket closed unexpectedly" + auto-reconnect
      // churn that was firing every ~7 min and spamming ERROR logs.
      socket: { keepAlive: 5000 },
      pingInterval: 30_000,
    })
    this.attachRedisEventHandlers(this.client, "api-redis-service")
  }

  async onModuleInit() {
    try {
      await this.client.connect()
    } catch (error) {
      this.logger.error("Failed to connect API Redis client", this.formatError(error))
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

  async ping(): Promise<string> {
    return this.client.ping()
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), { EX: ttlSeconds })
  }

  async getDelJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.sendCommand(["GETDEL", key])
    if (raw == null) return null
    if (typeof raw !== "string") return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
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
