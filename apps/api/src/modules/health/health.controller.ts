import { Controller, Get, ServiceUnavailableException, VERSION_NEUTRAL, Version } from "@nestjs/common"

import { PrismaService } from "../prisma/prisma.service"
import { RedisService } from "../redis/redis.service"
import { StorageService } from "../storage/storage.service"

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  // Intentionally unversioned: can be used by infra probes without /v1 prefix.
  @Get("health")
  @Version(VERSION_NEUTRAL)
  async health() {
    return { status: "ok" }
  }

  // Readiness checks dependencies (DB + Redis).
  @Get("ready")
  @Version(VERSION_NEUTRAL)
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      await this.redis.ping()
      await this.storage.ping()
      return { status: "ok" }
    } catch (err) {
      throw new ServiceUnavailableException("Dependencies not ready")
    }
  }
}
