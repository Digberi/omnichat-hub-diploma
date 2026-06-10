const ACCESS_KEY = "omnichat.accessToken"
const REFRESH_KEY = "omnichat.refreshToken"
const TOKENS_EVENT = "omnichat.tokens"

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(REFRESH_KEY)
}

export function setTokens(input: { accessToken: string; refreshToken: string }): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(ACCESS_KEY, input.accessToken)
  window.localStorage.setItem(REFRESH_KEY, input.refreshToken)
  window.dispatchEvent(new Event(TOKENS_EVENT))
}

export function clearTokens(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(ACCESS_KEY)
  window.localStorage.removeItem(REFRESH_KEY)
  window.dispatchEvent(new Event(TOKENS_EVENT))
}

let refreshInFlight: Promise<string | null> | null = null

// Exchanges the refresh token for a fresh access token. Idle tabs whose
// HTTP layer never fires lose their realtime socket because socket.io
// keeps re-authing with a stale localStorage token; calling this from
// the WS `connect_error` handler unsticks that loop without waiting for
// the user to do an HTTP action. De-duped via refreshInFlight so a
// burst of reconnect attempts only hits /auth/refresh once.
//
// NEVER calls `clearTokens` on failure: refresh tokens are single-use
// (auth.service.ts rotates `refreshTokenHash` on every redeem) so a
// concurrent api-client refresh will leave our copy stale and we'd 401
// here through no fault of the user. The api-client interceptor has
// its own onAuthError → clearTokens path for real "session is dead"
// cases; this helper just returns null and lets that path handle
// session cleanup if it's genuinely needed.
export function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null)
  if (refreshInFlight) return refreshInFlight
  // Snapshot the access token before we send. If after a failed refresh
  // the stored access token is different from this snapshot, someone
  // else (the api-client) already rotated the session for us — return
  // their fresh token instead of treating our 401 as a real failure.
  const accessTokenBefore = getAccessToken()
  refreshInFlight = (async () => {
    try {
      const refreshToken = getRefreshToken()
      if (!refreshToken) return null
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4121"
      const res = await fetch(`${base}/v1/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) {
        const accessTokenAfter = getAccessToken()
        if (accessTokenAfter && accessTokenAfter !== accessTokenBefore) {
          return accessTokenAfter
        }
        return null
      }
      const json = (await res.json()) as { accessToken?: unknown; refreshToken?: unknown }
      if (typeof json.accessToken !== "string" || typeof json.refreshToken !== "string") return null
      setTokens({ accessToken: json.accessToken, refreshToken: json.refreshToken })
      return json.accessToken
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}
