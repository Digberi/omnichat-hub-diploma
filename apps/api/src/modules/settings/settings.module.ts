import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { SettingsController } from "./settings.controller"
import { SettingsService } from "./settings.service"
import { SettingsRepository } from "./settings.repository"

@Module({
  imports: [AuthModule],
  controllers: [SettingsController],
  providers: [SettingsService, SettingsRepository],
  exports: [SettingsService],
})
export class SettingsModule {}

