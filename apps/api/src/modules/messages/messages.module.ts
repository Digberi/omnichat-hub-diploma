import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { PromModule } from "../prom/prom.module"
import { StorageModule } from "../storage/storage.module"
import { MessagesController } from "./messages.controller"
import { MessagesService } from "./messages.service"
import { MessagesRepository } from "./messages.repository"

@Module({
  imports: [AuthModule, StorageModule, PromModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesRepository],
  exports: [MessagesService],
})
export class MessagesModule {}
