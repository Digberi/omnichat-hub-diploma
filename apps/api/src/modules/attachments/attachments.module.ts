import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { AttachmentsController } from "./attachments.controller"
import { AttachmentsService } from "./attachments.service"
import { AttachmentsRepository } from "./attachments.repository"

@Module({
  imports: [AuthModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentsRepository],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}

