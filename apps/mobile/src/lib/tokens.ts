import * as SecureStore from "expo-secure-store"

const ACCESS_KEY = "omnichat.accessToken"
const REFRESH_KEY = "omnichat.refreshToken"

let accessToken: string | null = null
let refreshToken: string | null = null
const listeners = new Set<(token: string | null) => void>()

function notify() {
  for (const cb of listeners) cb(accessToken)
}

export async function loadTokens(): Promise<void> {
  accessToken = await SecureStore.getItemAsync(ACCESS_KEY)
  refreshToken = await SecureStore.getItemAsync(REFRESH_KEY)
  notify()
}

export function getAccessToken(): string | null {
  return accessToken
}

export function getRefreshToken(): string | null {
  return refreshToken
}

export function onTokensChanged(cb: (token: string | null) => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export async function setTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void> {
  accessToken = tokens.accessToken
  refreshToken = tokens.refreshToken
  await SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken)
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken)
  notify()
}

export async function clearTokens(): Promise<void> {
  accessToken = null
  refreshToken = null
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ])
  notify()
}
