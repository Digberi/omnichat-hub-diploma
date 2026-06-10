import { createApiClient } from "@omnichat/api-client"

import { env } from "./env"
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./tokens"

export const api = createApiClient({
  baseUrl: env.apiBaseUrl,
  getAccessToken,
  getRefreshToken,
  setTokens,
  onAuthError: clearTokens,
})
