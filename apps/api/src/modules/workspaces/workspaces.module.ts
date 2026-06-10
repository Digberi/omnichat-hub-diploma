import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { WorkspacesController } from "./workspaces.controller"
import { WorkspacesService } from "./workspaces.service"
import { WorkspacesRepository } from "./workspaces.repository"

@Module({
  imports: [AuthModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspacesRepository],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}

