import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { TagsController } from "./tags.controller"
import { TagsService } from "./tags.service"
import { TagsRepository } from "./tags.repository"

@Module({
  imports: [AuthModule],
  controllers: [TagsController],
  providers: [TagsService, TagsRepository],
  exports: [TagsService],
})
export class TagsModule {}

