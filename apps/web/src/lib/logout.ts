import { api } from "./api"
import { clearTokens } from "./tokens"

export async function logout(): Promise<void> {
  try {
    await api.POST("/v1/auth/logout", {})
  } catch {
    // best-effort: still clear local tokens
  } finally {
    clearTokens()
  }
}

