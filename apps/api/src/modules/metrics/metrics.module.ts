import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { PrismaModule } from "../prisma/prisma.module"
import { StorageModule } from "../storage/storage.module"
import { MetricsController } from "./metrics.controller"
import { MetricsService } from "./metrics.service"
import { PrometheusController } from "./prometheus.controller"
import { PrometheusService } from "./prometheus.service"

@Module({
  imports: [PrismaModule, AuthModule, StorageModule],
  controllers: [MetricsController, PrometheusController],
  providers: [MetricsService, PrometheusService],
})
export class MetricsModule {}
