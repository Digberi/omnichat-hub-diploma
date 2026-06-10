import Constants, { ExecutionEnvironment } from "expo-constants"
import * as Device from "expo-device"
import { Platform } from "react-native"

import { DevicePlatform } from "@omnichat/contracts"

import { api } from "./api"

export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  Constants.appOwnership === "expo" ||
  (Constants as unknown as { expoGoConfig?: unknown }).expoGoConfig != null

export type PushPermissionStatus = "granted" | "denied" | "undetermined" | "unknown"

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim()
  return v.length > 0 ? v : null
}

function normalizePermissionStatus(input: unknown): PushPermissionStatus {
  if (input === "granted" || input === "denied" || input === "undetermined") return input
  return "unknown"
}

function getExpoProjectId(): string | null {
  const easProjectId =
    (Constants as unknown as { easConfig?: { projectId?: unknown } }).easConfig?.projectId ??
    (Constants.expoConfig as unknown as { extra?: { eas?: { projectId?: unknown } } }).extra?.eas?.projectId ??
    (Constants as unknown as { manifest2?: { extra?: { eas?: { projectId?: unknown } } } }).manifest2?.extra?.eas?.projectId

  return safeString(easProjectId)
}

export async function getPushPermissionState(): Promise<{ status: PushPermissionStatus; canAskAgain: boolean | null }> {
  // Avoid importing `expo-notifications` in Expo Go.
  // In SDK 53+, Expo Go removed support for Android remote push and logs noisy errors/warnings.
  if (isExpoGo) return { status: "unknown", canAskAgain: null }

  try {
    const Notifications = await import("expo-notifications")
    const res = await Notifications.getPermissionsAsync()
    return {
      status: normalizePermissionStatus(res.status),
      canAskAgain: typeof res.canAskAgain === "boolean" ? res.canAskAgain : null,
    }
  } catch {
    return { status: "unknown", canAskAgain: null }
  }
}

export async function registerDeviceForPushNotifications(input?: {
  // If true, will call requestPermissionsAsync() when not granted.
  interactive?: boolean
}): Promise<
  | { ok: true; status: PushPermissionStatus; canAskAgain: boolean | null; token: string; projectId: string | null; registeredAt: string }
  | { ok: false; status: PushPermissionStatus; canAskAgain: boolean | null; reason: string; projectId: string | null }
> {
  if (isExpoGo) {
    return { ok: false, status: "unknown", canAskAgain: null, reason: "expo_go_remote_push_not_supported", projectId: null }
  }
  if (!Device.isDevice) {
    return { ok: false, status: "unknown", canAskAgain: null, reason: "not_a_physical_device", projectId: null }
  }

  const interactive = Boolean(input?.interactive)

  let Notifications: typeof import("expo-notifications")
  try {
    Notifications = await import("expo-notifications")
  } catch {
    return { ok: false, status: "unknown", canAskAgain: null, reason: "expo_notifications_unavailable", projectId: null }
  }

  const existing = await Notifications.getPermissionsAsync()
  let status = normalizePermissionStatus(existing.status)
  let canAskAgain = typeof existing.canAskAgain === "boolean" ? existing.canAskAgain : null

  if (status !== "granted" && interactive) {
    const req = await Notifications.requestPermissionsAsync()
    status = normalizePermissionStatus(req.status)
    canAskAgain = typeof req.canAskAgain === "boolean" ? req.canAskAgain : canAskAgain
  }

  if (status !== "granted") {
    return { ok: false, status, canAskAgain, reason: "permission_not_granted", projectId: null }
  }

  const projectId = getExpoProjectId()

  let token: string
  try {
    const tokenRes = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync()
    token = tokenRes.data
  } catch {
    return { ok: false, status, canAskAgain, reason: "expo_push_token_failed", projectId }
  }

  const platform =
    Platform.OS === "ios"
      ? DevicePlatform.IOS
      : Platform.OS === "android"
        ? DevicePlatform.ANDROID
        : DevicePlatform.WEB

  const res = await api.POST("/v1/notifications/device-tokens", {
    body: { platform, token },
  })

  if (res.error) {
    return { ok: false, status, canAskAgain, reason: "api_register_token_failed", projectId }
  }

  const updatedAt =
    typeof (res.data as { updatedAt?: unknown } | undefined)?.updatedAt === "string"
      ? ((res.data as { updatedAt: string }).updatedAt ?? new Date().toISOString())
      : new Date().toISOString()

  return { ok: true, status, canAskAgain, token, projectId, registeredAt: updatedAt }
}

export function extractConversationIdFromPushData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null
  return safeString((data as Record<string, unknown>).conversationId)
}

export function extractPushKind(data: unknown): string | null {
  if (!data || typeof data !== "object") return null
  return safeString((data as Record<string, unknown>).kind)
}
