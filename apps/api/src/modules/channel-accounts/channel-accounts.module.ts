import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { RedisModule } from "../redis/redis.module"
import { ChannelAccountsController } from "./channel-accounts.controller"
import { OlxOauthController } from "./olx-oauth.controller"
import { ChannelAccountsService } from "./channel-accounts.service"
import { ChannelAccountsRepository } from "./channel-accounts.repository"
import { OlxOauthService } from "./olx-oauth.service"

@Module({
  imports: [AuthModule, RedisModule],
  controllers: [ChannelAccountsController, OlxOauthController],
  providers: [ChannelAccountsService, ChannelAccountsRepository, OlxOauthService],
  exports: [ChannelAccountsService, ChannelAccountsRepository],
})
export class ChannelAccountsModule {}
