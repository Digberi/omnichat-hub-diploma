import { Controller, Get, ServiceUnavailableException } from "@nestjs/common"

import { PrismaService } from "../prisma/prisma.service"
import { RedisService } from "../redis/redis.service"

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get("health")
  async health() {
    return { status: "ok" }
  }

  @Get("ready")
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      await this.redis.ping()
      return { status: "ok" }
    } catch {
      throw new ServiceUnavailableException("Dependencies not ready")
    }
  }
}
