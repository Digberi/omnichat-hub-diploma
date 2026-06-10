import { Controller, Get, Header, Headers, UnauthorizedException, VERSION_NEUTRAL, Version } from "@nestjs/common"
import { ApiExcludeController } from "@nestjs/swagger"
import { ConfigService } from "@nestjs/config"

import { PrometheusService } from "./prometheus.service"

@ApiExcludeController()
@Controller()
export class PrometheusController {
  constructor(
    private readonly config: ConfigService,
    private readonly prometheus: PrometheusService,
  ) {}

  @Get("metrics")
  @Version(VERSION_NEUTRAL)
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async metrics(@Headers("authorization") authorization?: string): Promise<string> {
    const token = String(this.config.get("METRICS_TOKEN") ?? "").trim()
    if (token && authorization !== `Bearer ${token}`) {
      throw new UnauthorizedException("Invalid metrics token")
    }

    return this.prometheus.render()
  }
}
