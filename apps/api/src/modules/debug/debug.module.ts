import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { PrismaModule } from "../prisma/prisma.module"
import { DebugController } from "./debug.controller"
import { DebugService } from "./debug.service"

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DebugController],
  providers: [DebugService],
})
export class DebugModule {}
