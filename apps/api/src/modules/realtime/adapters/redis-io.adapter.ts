import { IoAdapter } from "@nestjs/platform-socket.io"
import { createAdapter } from "@socket.io/redis-adapter"
import { ConfigService } from "@nestjs/config"
import { createClient, type RedisClientType } from "redis"
import { Logger, type INestApplicationContext } from "@nestjs/common"
import type { ServerOptions } from "socket.io"

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name)
  private pubClient?: RedisClientType
  private subClient?: RedisClientType

  constructor(
    app: INestApplicationContext,
    private readonly config: ConfigService,
  ) {
    super(app)
  }

  async connectToRedis(): Promise<void> {
    const url = this.config.getOrThrow<string>("REDIS_URL")
    // See apps/api/src/modules/redis/redis.service.ts for why we set
    // socket.keepAlive + pingInterval. duplicate() inherits these options.
    this.pubClient = createClient({
      url,
      socket: { keepAlive: 5000 },
      pingInterval: 30_000,
    })
    this.attachRedisEventHandlers(this.pubClient, "socket-io-pub")
    this.subClient = this.pubClient.duplicate()
    this.attachRedisEventHandlers(this.subClient, "socket-io-sub")
    try {
      await this.pubClient.connect()
      await this.subClient.connect()
    } catch (error) {
      this.logger.error("Failed to connect Socket.IO Redis adapter", this.formatError(error))
      throw error
    }
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const corsOrigins = String(this.config.get("CORS_ORIGINS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    const nodeEnv = String(this.config.get("NODE_ENV") ?? "development")
    const socketKeyRaw = String(this.config.get("SOCKETIO_REDIS_KEY") ?? "").trim()
    const socketKey = socketKeyRaw.length > 0 ? socketKeyRaw : `socket.io:${nodeEnv}`

    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: corsOrigins.length > 0 ? corsOrigins : false,
        credentials: true,
      },
    })
    if (!this.pubClient || !this.subClient) {
      throw new Error("RedisIoAdapter not connected")
    }
    server.adapter(createAdapter(this.pubClient, this.subClient, { key: socketKey }))
    return server
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
