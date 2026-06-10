import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { StatusesController } from "./statuses.controller"
import { StatusesService } from "./statuses.service"
import { StatusesRepository } from "./statuses.repository"

@Module({
  imports: [AuthModule],
  controllers: [StatusesController],
  providers: [StatusesService, StatusesRepository],
  exports: [StatusesService],
})
export class StatusesModule {}

