import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { TemplatesController } from "./templates.controller"
import { TemplatesService } from "./templates.service"
import { TemplatesRepository } from "./templates.repository"

@Module({
  imports: [AuthModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, TemplatesRepository],
  exports: [TemplatesService],
})
export class TemplatesModule {}

