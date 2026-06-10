import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { resolve } from "node:path"

import { envSchema } from "./env"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(__dirname, "../../../.env"),
      validate: (config) => envSchema.parse(config),
    }),
  ],
})
export class AppConfigModule {}
