import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createClient, type RedisClientType } from "redis"
import { Emitter } from "@socket.io/redis-emitter"

@Injectable()
export class RealtimeEmitterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeEmitterService.name)
  private redis!: RedisClientType
  private emitter!: Emitter

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    // See apps/api/src/modules/redis/redis.service.ts for why we set
    // socket.keepAlive + pingInterval.
    this.redis = createClient({
      url: this.config.getOrThrow<string>("REDIS_URL"),
      socket: { keepAlive: 5000 },
      pingInterval: 30_000,
    })
    this.attachRedisEventHandlers(this.redis, "workers-realtime-emitter")
    try {
      await this.redis.connect()
    } catch (error) {
      this.logger.error("Failed to connect workers realtime emitter to Redis", this.formatError(error))
      throw error
    }
    const nodeEnv = String(this.config.get("NODE_ENV") ?? "development")
    const socketKeyRaw = String(this.config.get("SOCKETIO_REDIS_KEY") ?? "").trim()
    const socketKey = socketKeyRaw.length > 0 ? socketKeyRaw : `socket.io:${nodeEnv}`
    this.emitter = new Emitter(this.redis, { key: socketKey })
  }

  async onModuleDestroy() {
    try {
      if (!this.redis?.isOpen) return
      await this.redis.quit()
    } catch {
      // Best-effort shutdown.
    }
  }

  emitToWorkspace(workspaceId: string, eventName: string, payload: unknown): void {
    if (!this.redis?.isReady || !this.emitter) {
      this.logger.warn(`Skipping realtime emit "${eventName}" because Redis emitter is not ready`)
      return
    }

    try {
      this.emitter.to(`workspace:${workspaceId}`).emit(eventName, payload)
    } catch (error) {
      this.logger.error(`Failed to emit realtime event "${eventName}"`, this.formatError(error))
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
