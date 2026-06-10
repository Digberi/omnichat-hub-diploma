import { type DynamicModule, Global, Module, type Provider, type Type } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

import { DekManager } from "../core/dek-manager"
import { EnvelopeCryptoService } from "../core/envelope-crypto"
import { KmsUnavailable } from "../core/errors"
import type { InfisicalKmsClient } from "../core/types"
import { InfisicalKmsClient as InfisicalKmsClientImpl } from "../infisical/infisical-kms-client"

export const KMS_CLIENT = Symbol("@omnichat/kms/InfisicalKmsClient")
export const DEK_MANAGER = Symbol("@omnichat/kms/DekManager")
export const ENVELOPE_CRYPTO = Symbol("@omnichat/kms/EnvelopeCryptoService")

export interface KmsModuleOptions {
  imports?: DynamicModule["imports"]
  /**
   * PrismaService (or compatible PrismaClient) class to inject by class
   * token. Must be a provider registered as @Global() in the consumer,
   * since KmsModule itself is @Global() and doesn't redeclare it.
   */
  prismaService: Type<unknown>
  /** Used to construct the real InfisicalKmsClient. Pass useClass/useFactory for tests. */
  kmsClientProvider?: Provider
  /** When kmsClientProvider is not supplied, the module reads these via ConfigService. */
  envKeys?: {
    baseUrl?: string       // default: INFISICAL_KMS_BASE_URL
    clientId?: string      // default: INFISICAL_CLIENT_ID
    clientSecret?: string  // default: INFISICAL_CLIENT_SECRET
    kekKeyId?: string      // default: INFISICAL_KMS_KEY_ID
  }
}

/**
 * Returns an InfisicalKmsClient that throws KmsUnavailable on every call.
 * Used when env vars are absent at boot — keeps the app starting cleanly
 * while making any actual KMS use fail loudly with a clear message.
 */
function makeUnconfiguredClient(missing: string[]): InfisicalKmsClient {
  const fail = () => {
    throw new KmsUnavailable(
      `@omnichat/kms: required env vars not configured: ${missing.join(", ")}`,
    )
  }
  return {
    wrapDek: fail,
    unwrapDek: fail,
  } as unknown as InfisicalKmsClient
}

@Global()
@Module({})
export class KmsModule {
  static forRoot(options: KmsModuleOptions): DynamicModule {
    const envKeys = {
      baseUrl: options.envKeys?.baseUrl ?? "INFISICAL_KMS_BASE_URL",
      clientId: options.envKeys?.clientId ?? "INFISICAL_CLIENT_ID",
      clientSecret: options.envKeys?.clientSecret ?? "INFISICAL_CLIENT_SECRET",
      kekKeyId: options.envKeys?.kekKeyId ?? "INFISICAL_KMS_KEY_ID",
    }

    const kmsClientProvider: Provider = options.kmsClientProvider ?? {
      provide: KMS_CLIENT,
      useFactory: (config: ConfigService) => {
        const baseUrl = String(config.get<string>(envKeys.baseUrl) ?? "").trim()
        const clientId = String(config.get<string>(envKeys.clientId) ?? "").trim()
        const clientSecret = String(config.get<string>(envKeys.clientSecret) ?? "").trim()
        const kekKeyId = String(config.get<string>(envKeys.kekKeyId) ?? "").trim()
        const missing: string[] = []
        if (!baseUrl) missing.push(envKeys.baseUrl)
        if (!clientId) missing.push(envKeys.clientId)
        if (!clientSecret) missing.push(envKeys.clientSecret)
        if (!kekKeyId) missing.push(envKeys.kekKeyId)
        if (missing.length > 0) {
          return makeUnconfiguredClient(missing)
        }
        return new InfisicalKmsClientImpl({ baseUrl, clientId, clientSecret, kekKeyId })
      },
      inject: [ConfigService],
    }

    const dekManagerProvider: Provider = {
      provide: DEK_MANAGER,
      useFactory: (prisma: unknown, kmsClient: InfisicalKmsClient) =>
        new DekManager({ prisma: prisma as never, kmsClient }),
      inject: [options.prismaService, KMS_CLIENT],
    }

    const envelopeCryptoProvider: Provider = {
      provide: ENVELOPE_CRYPTO,
      useFactory: (dekManager: DekManager) => new EnvelopeCryptoService({ dekManager }),
      inject: [DEK_MANAGER],
    }

    return {
      module: KmsModule,
      imports: options.imports ?? [],
      providers: [kmsClientProvider, dekManagerProvider, envelopeCryptoProvider],
      exports: [KMS_CLIENT, DEK_MANAGER, ENVELOPE_CRYPTO],
    }
  }
}
