import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { ConversationsController } from "./conversations.controller"
import { ConversationsService } from "./conversations.service"
import { ConversationsRepository } from "./conversations.repository"

@Module({
  imports: [AuthModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationsRepository],
  exports: [ConversationsService],
})
export class ConversationsModule {}
