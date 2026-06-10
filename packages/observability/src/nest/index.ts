import { type DynamicModule, type Provider } from "@nestjs/common"
import { APP_INTERCEPTOR } from "@nestjs/core"
import { ObservabilityInterceptor } from "./interceptor"

export interface ObservabilityModuleOptions {
  serviceName: string
}

const OBSERVABILITY_OPTIONS = "OBSERVABILITY_OPTIONS"

export class ObservabilityModule {
  static forRoot(options: ObservabilityModuleOptions): DynamicModule {
    const optionsProvider: Provider = { provide: OBSERVABILITY_OPTIONS, useValue: options }
    const interceptorBinding: Provider = { provide: APP_INTERCEPTOR, useClass: ObservabilityInterceptor }
    return {
      module: ObservabilityModule,
      providers: [optionsProvider, ObservabilityInterceptor, interceptorBinding],
      exports: [ObservabilityInterceptor, OBSERVABILITY_OPTIONS],
      global: true,
    }
  }
}

export { ObservabilityInterceptor } from "./interceptor"
export { OBSERVABILITY_OPTIONS }
export { wrapSocketEmit, extractTraceparentFromPayload } from "./socket-io-middleware"
