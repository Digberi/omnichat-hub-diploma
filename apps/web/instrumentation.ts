/**
 * Next.js instrumentation hook (App Router).
 *
 * Auto-discovered by Next 13+. Runs once per server runtime boot.
 *
 * No-op in browser/edge runtimes. The Node SSR path delegates to
 * `@omnichat/observability/vercel`, which is itself a no-op when
 * `OBS_ENABLED!=1` — so unset env keeps prod behavior unchanged.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrap } = await import("@omnichat/observability/vercel")
    await bootstrap({ serviceName: "omnichat-web-ssr" })
  }
}
