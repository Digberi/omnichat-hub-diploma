import { createApiClient } from "@omnichat/api-client"

import { clearTokens, getAccessToken, getRefreshToken, refreshAccessToken, setTokens } from "./tokens"

export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4121",
  getAccessToken,
  getRefreshToken,
  setTokens,
  onAuthError: clearTokens,
  // Delegate 401 recovery to the shared `refreshAccessToken` in `tokens.ts`
  // so the HTTP layer and the socket.io `connect_error` handler share a
  // single in-flight refresh — eliminates the WebKit auth-vibrate race
  // where two parallel `/v1/auth/refresh` calls collided on the single-use
  // refresh token (one 201, one 401 → `onAuthError` → kicked out).
  refreshAccessToken,
})
