import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { ChannelAccountsModule } from "../channel-accounts/channel-accounts.module"
import { RozetkaApiService } from "./rozetka-api.service"
import { RozetkaConnectController } from "./rozetka-connect.controller"
import { RozetkaConnectService } from "./rozetka-connect.service"

@Module({
  imports: [AuthModule, ChannelAccountsModule],
  controllers: [RozetkaConnectController],
  providers: [RozetkaApiService, RozetkaConnectService],
  exports: [RozetkaApiService, RozetkaConnectService],
})
export class RozetkaModule {}
