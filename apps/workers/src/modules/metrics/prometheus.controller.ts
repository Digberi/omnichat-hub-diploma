import { Controller, Get, Header, Headers, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

import { PrometheusService } from "./prometheus.service"

@Controller()
export class PrometheusController {
  constructor(
    private readonly config: ConfigService,
    private readonly prometheus: PrometheusService,
  ) {}

  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async metrics(@Headers("authorization") authorization?: string): Promise<string> {
    const token = String(this.config.get("METRICS_TOKEN") ?? "").trim()
    if (token && authorization !== `Bearer ${token}`) {
      throw new UnauthorizedException("Invalid metrics token")
    }

    return this.prometheus.render()
  }
}
