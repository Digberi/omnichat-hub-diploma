import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { ChannelAccountsModule } from "../channel-accounts/channel-accounts.module"
import { PromApiService } from "./prom-api.service"
import { PromConnectController } from "./prom-connect.controller"
import { PromConnectService } from "./prom-connect.service"

@Module({
  imports: [AuthModule, ChannelAccountsModule],
  controllers: [PromConnectController],
  providers: [PromApiService, PromConnectService],
  exports: [PromApiService, PromConnectService],
})
export class PromModule {}
