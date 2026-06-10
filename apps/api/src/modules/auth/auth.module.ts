import { Module } from "@nestjs/common"
import { JwtModule } from "@nestjs/jwt"

import { AuthController } from "./auth.controller"
import { AuthService } from "./auth.service"
import { JwtAuthGuard } from "./guards/jwt-auth.guard"
import { WorkspaceMembershipGuard } from "./guards/workspace-membership.guard"
import { RedisModule } from "../redis/redis.module"
import { GoogleAuthController } from "./google-auth.controller"
import { GoogleAuthService } from "./google-auth.service"
import { EmailModule } from "../email/email.module"

@Module({
  imports: [
    JwtModule.register({
      // secrets are provided at call-sites; keep module registration minimal.
    }),
    RedisModule,
    EmailModule,
  ],
  controllers: [AuthController, GoogleAuthController],
  providers: [AuthService, GoogleAuthService, JwtAuthGuard, WorkspaceMembershipGuard],
  exports: [AuthService, GoogleAuthService, JwtAuthGuard, WorkspaceMembershipGuard, JwtModule],
})
export class AuthModule {}
