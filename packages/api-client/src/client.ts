import createClient from "openapi-fetch"

import type { paths as GeneratedPaths } from "./schema"

type HttpMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace"

type EnforceMethodKeys<T> = {
  // openapi-typescript marks unsupported methods as optional `?: never`.
  // With `exactOptionalPropertyTypes`, indexed access turns that into `undefined`,
  // which breaks openapi-fetch’s expectations and can collapse responses to `never`.
  [M in HttpMethod]-?: M extends keyof T ? Exclude<T[M], undefined> : never
}

// openapi-fetch expects all HttpMethod keys to exist on every path item.
// openapi-typescript generates optional method keys (e.g. `get?: never`), which makes
// `PathsWithMethod` collapse to `never` under strict TS settings.
type Paths = {
  [P in keyof GeneratedPaths]: Omit<GeneratedPaths[P], HttpMethod> & EnforceMethodKeys<GeneratedPaths[P]>
}

export type ApiClientConfig = {
  baseUrl: string
  getAccessToken?: () => string | null
  getRefreshToken?: () => string | null
  setTokens?: (tokens: { accessToken: string; refreshToken: string }) => void | Promise<void>
  onAuthError?: () => void | Promise<void>
  /**
   * Optional host-provided refresh function. When supplied, the client will
   * DELEGATE 401 recovery to it instead of POSTing /v1/auth/refresh itself.
   *
   * Why: the web app has its own `refreshAccessToken` in `lib/tokens.ts` that
   * is also called from the socket.io `connect_error` handler. With the
   * client's internal refresh, those two paths each had their own module-
   * level `refreshInFlight` lock and would fire concurrent /v1/auth/refresh
   * requests with the same stale refresh token. Refresh tokens are single-
   * use (rotated server-side on each redeem) so the loser of the race got
   * 401, which here triggers `onAuthError` and kicks the user out — most
   * visible on WebKit (Safari, Opera) because its more aggressive background
   * tab throttling makes the two paths more likely to overlap on resume.
   *
   * The delegate must return the fresh access token on success or null on
   * failure; it MUST be deduplicated by the host (i.e. share its own
   * in-flight promise across all callers) so we end up with exactly one
   * `/v1/auth/refresh` POST per refresh window.
   */
  refreshAccessToken?: () => Promise<string | null>
}

export type ApiClient = ReturnType<typeof createApiClient>

export function createApiClient(config: ApiClientConfig) {
  const baseUrl = config.baseUrl.replace(/\/$/, "")
  const refreshUrl = `${baseUrl}/v1/auth/refresh`

  let refreshInFlight: Promise<boolean> | null = null

  async function refreshTokensIfPossible(): Promise<boolean> {
    // Prefer the host-provided refresh delegate when available. This lets the
    // host (e.g. the web app) share a single in-flight promise across all
    // callers — its own background refresh path AND the api-client's 401
    // recovery — so concurrent 401s never race two `/v1/auth/refresh` calls
    // against the same single-use refresh token. See the docstring on
    // `ApiClientConfig.refreshAccessToken` for the full rationale.
    if (config.refreshAccessToken) {
      try {
        const next = await config.refreshAccessToken()
        return typeof next === "string" && next.length > 0
      } catch {
        return false
      }
    }

    const refreshToken = config.getRefreshToken?.()
    if (!refreshToken) return false

    try {
      const res = await fetch(
        new Request(refreshUrl, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({ refreshToken }),
        }),
      )

      if (!res.ok) return false
      const json = (await res.json()) as any
      if (!json?.accessToken || !json?.refreshToken) return false

      await config.setTokens?.({ accessToken: String(json.accessToken), refreshToken: String(json.refreshToken) })
      return true
    } catch {
      return false
    }
  }

  async function ensureRefreshedOnce(): Promise<boolean> {
    if (refreshInFlight) return refreshInFlight

    refreshInFlight = (async () => {
      try {
        return await refreshTokensIfPossible()
      } finally {
        refreshInFlight = null
      }
    })()

    return refreshInFlight
  }

  function withHeaders(req: Request, token: string | null): Request {
    const headers = new Headers(req.headers)
    headers.set("accept", "application/json")
    if (token) headers.set("authorization", `Bearer ${token}`)
    return new Request(req, { headers })
  }

  /**
   * Stamp the W3C `traceparent` header onto an outgoing request so the API
   * span can be linked to the originating browser span in Tempo.
   *
   * Server-side: no-op (no active browser tracer; SSR uses its own pipeline).
   * Failure-safe: never throws — observability must not break user requests.
   * Lazy import keeps the browser OTel modules out of server bundles.
   */
  async function withTraceparent(req: Request): Promise<Request> {
    if (typeof window === "undefined") return req
    try {
      const { injectTraceparentIntoHeaders } = await import("@omnichat/observability/browser")
      const current: Record<string, string> = {}
      req.headers.forEach((value, key) => {
        current[key] = value
      })
      const enriched = injectTraceparentIntoHeaders(current)
      const headers = new Headers(req.headers)
      for (const [k, v] of Object.entries(enriched)) {
        // Cast through String() so this stays compilable even if
        // injectTraceparentIntoHeaders' return type degrades to
        // Record<string, unknown> (e.g. when /browser types haven't been
        // built yet and tsc can't resolve the subpath export).
        if (!headers.has(k)) headers.set(k, String(v))
      }
      return new Request(req, { headers })
    } catch {
      return req
    }
  }

  return createClient<Paths>({
    baseUrl,
    fetch: async (request: Request) => {
      // Stamp traceparent on the OUTERMOST request so both the initial call
      // and the post-refresh retry land under the same browser span.
      const traced = await withTraceparent(request)

      // Preserve body for possible retry on auth refresh.
      const original = new Request(traced)

      const token = config.getAccessToken?.() ?? null
      const first = await fetch(withHeaders(original.clone(), token))

      // Never attempt refresh while refreshing.
      if (first.status === 401 && !original.url.includes("/v1/auth/refresh")) {
        const refreshed = await ensureRefreshedOnce()
        if (refreshed) {
          const nextToken = config.getAccessToken?.() ?? null
          return fetch(withHeaders(original.clone(), nextToken))
        }

        await config.onAuthError?.()
      }

      return first
    },
  })
}
