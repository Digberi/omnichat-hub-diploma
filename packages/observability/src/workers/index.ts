// Cloudflare Workers entry point — STUB.
//
// We don't run CF Workers today. This export reserves the subpath so
// consumers can write `import { bootstrap } from '@omnichat/observability/workers'`
// once CF support is added (likely via @microlabs/otel-cf-workers or a
// custom transport over Tail Workers).

export interface WorkersBootstrapOptions {
  serviceName: string
}

export async function bootstrap(_options: WorkersBootstrapOptions): Promise<void> {
  throw new Error(
    "@omnichat/observability/workers is a stub — Cloudflare Workers integration not yet implemented",
  )
}
