import Constants from "expo-constants"
import * as Device from "expo-device"
import { Platform } from "react-native"

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "")
}

function parseNumberOrFallback(input: string | undefined, fallback: number): number {
  if (!input) return fallback
  const n = Number(input)
  return Number.isFinite(n) ? n : fallback
}

function nonEmpty(input: string | undefined): string | undefined {
  if (!input) return undefined
  const v = input.trim()
  return v.length > 0 ? v : undefined
}

function hostFromHostUri(hostUri: string | undefined | null): string | null {
  if (!hostUri) return null
  const cleaned = hostUri.replace(/^https?:\/\//, "").split("/")[0]
  const host = cleaned.split(":")[0]
  return host || null
}

function defaultDevApiBaseUrl(): string {
  const host =
    hostFromHostUri(Constants.expoConfig?.hostUri) ??
    hostFromHostUri((Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost) ??
    hostFromHostUri((Constants as unknown as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost) ??
    hostFromHostUri(
      (Constants as unknown as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2?.extra?.expoClient?.hostUri,
    )

  if (host) return `http://${host}:4121`
  return Platform.OS === "android" ? "http://10.0.2.2:4121" : "http://localhost:4121"
}

function getHostname(inputUrl: string): string | null {
  try {
    return new URL(inputUrl).hostname
  } catch {
    return null
  }
}

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase()
  return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0"
}

function resolveBaseUrlForDevice(explicit: string | undefined, computed: string): string {
  const v = nonEmpty(explicit)
  if (!v) return computed

  if (!Device.isDevice) return v

  const host = getHostname(v)
  if (!host) return v

  // If user left the common dev placeholder ("localhost") on a physical device,
  // replace with Metro host IP when possible.
  const isPlaceholder = isLoopbackHost(host) || (Platform.OS === "android" && host === "10.0.2.2")
  if (!isPlaceholder) return v

  const computedHost = getHostname(computed)
  if (!computedHost) return v

  const computedLooksValid = !isLoopbackHost(computedHost) && !(Platform.OS === "android" && computedHost === "10.0.2.2")
  return computedLooksValid ? computed : v
}

export const env = {
  apiBaseUrl: stripTrailingSlash(resolveBaseUrlForDevice(process.env.EXPO_PUBLIC_API_BASE_URL, defaultDevApiBaseUrl())),
  wsUrl: stripTrailingSlash(resolveBaseUrlForDevice(process.env.EXPO_PUBLIC_WS_URL, defaultDevApiBaseUrl())),
  wsPath: process.env.EXPO_PUBLIC_WS_PATH ?? "/ws",
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? null,
  sentryTracesSampleRate: parseNumberOrFallback(
    process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    process.env.NODE_ENV === "production" ? 0.05 : 0.1,
  ),
  sentryEnvironment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? null,
  sentryRelease: process.env.EXPO_PUBLIC_SENTRY_RELEASE ?? null,
} as const
