import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import * as Sentry from "@sentry/react-native"
import * as Device from "expo-device"
import { useCallback, useEffect, useState } from "react"
import { Linking, ScrollView, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import type { components } from "@omnichat/api-client"

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Switch, Text } from "@/components/ui"
import { ScreenHeader } from "@/components/ScreenHeader"

import { api } from "../lib/api"
import { env } from "../lib/env"
import { getPushPermissionState, isExpoGo, registerDeviceForPushNotifications, type PushPermissionStatus } from "../lib/push"
import type { RootStackParamList } from "../navigation/types"

type Props = NativeStackScreenProps<RootStackParamList, "Settings">
type WorkspaceSettingsDto = components["schemas"]["WorkspaceSettingsDto"]

function errorToMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

function permissionLabel(status: PushPermissionStatus): string {
  switch (status) {
    case "granted":
      return "Увімкнено"
    case "denied":
      return "Вимкнено"
    case "undetermined":
      return "Не запитували"
    default:
      return "Невідомо"
  }
}

function shortToken(token: string): string {
  if (token.length <= 24) return token
  return `${token.slice(0, 10)}...${token.slice(-10)}`
}

function pushSetupErrorToMessage(reason: string): string {
  switch (reason) {
    case "expo_go_remote_push_not_supported":
      return "Expo Go не підтримує remote push (SDK 53+). Для пушів потрібен dev build (dev client)."
    case "not_a_physical_device":
      return "Push працює лише на реальному пристрої."
    case "permission_not_granted":
      return "Дозвіл на сповіщення не надано."
    case "expo_notifications_unavailable":
      return "Не вдалося ініціалізувати expo-notifications."
    case "expo_push_token_failed":
      return "Не вдалося отримати Expo push token."
    case "api_register_token_failed":
      return "Не вдалося зареєструвати push-токен на сервері."
    default:
      return "Не вдалося налаштувати push."
  }
}

export function SettingsScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<WorkspaceSettingsDto | null>(null)

  const [pushPermission, setPushPermission] = useState<PushPermissionStatus>("unknown")
  const [pushCanAskAgain, setPushCanAskAgain] = useState<boolean | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMessage, setPushMessage] = useState<string | null>(null)
  const [pushProjectId, setPushProjectId] = useState<string | null>(null)
  const [pushTokenPreview, setPushTokenPreview] = useState<string | null>(null)
  const [pushRegisteredAt, setPushRegisteredAt] = useState<string | null>(null)

  const [devSentryBusy, setDevSentryBusy] = useState(false)
  const [devSentryMarker, setDevSentryMarker] = useState<string | null>(null)
  const [devSentryMessage, setDevSentryMessage] = useState<string | null>(null)

  const [autoArchiveDays, setAutoArchiveDays] = useState("7")
  const [pushNewMessageEnabled, setPushNewMessageEnabled] = useState(true)
  const [pushSendErrorEnabled, setPushSendErrorEnabled] = useState(true)

  const refreshPushPermission = useCallback(async () => {
    const p = await getPushPermissionState()
    setPushPermission(p.status)
    setPushCanAskAgain(p.canAskAgain)
  }, [])

  const fetchSettings = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await api.GET("/v1/settings")
      if (res.error || !res.data) throw new Error(JSON.stringify(res.error ?? "no data"))
      const s = res.data as WorkspaceSettingsDto
      setSettings(s)
      setAutoArchiveDays(String(s.autoArchiveDays ?? 7))
      setPushNewMessageEnabled(Boolean(s.pushNewMessageEnabled))
      setPushSendErrorEnabled(Boolean(s.pushSendErrorEnabled))
    } catch (e: unknown) {
      setError(errorToMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    void refreshPushPermission()
  }, [refreshPushPermission])

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      void refreshPushPermission()
    })
    return unsub
  }, [navigation, refreshPushPermission])

  async function save() {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      const days = Number(autoArchiveDays)
      const res = await api.PATCH("/v1/settings", {
        body: {
          autoArchiveDays: Number.isFinite(days) ? days : 7,
          pushNewMessageEnabled,
          pushSendErrorEnabled,
        },
      })
      if (res.error || !res.data) throw new Error(JSON.stringify(res.error ?? "no data"))
      setSettings(res.data as WorkspaceSettingsDto)
    } catch (e: unknown) {
      setError(errorToMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function enableOrRegisterPush(interactive: boolean) {
    setPushBusy(true)
    setPushMessage(null)
    try {
      const res = await registerDeviceForPushNotifications({ interactive })
      await refreshPushPermission()
      if (res.ok) {
        setPushProjectId(res.projectId)
        setPushTokenPreview(shortToken(res.token))
        setPushRegisteredAt(res.registeredAt)
        setPushMessage("Push увімкнено на цьому пристрої. Токен успішно зареєстровано на API.")
      } else {
        setPushProjectId(res.projectId)
        setPushMessage(pushSetupErrorToMessage(res.reason))
      }
    } catch {
      setPushMessage("Не вдалося налаштувати push.")
    } finally {
      setPushBusy(false)
    }
  }

  async function sendSentrySmoke(): Promise<void> {
    if (!env.sentryDsn) {
      setDevSentryMessage("Sentry DSN порожній. Заповни EXPO_PUBLIC_SENTRY_DSN в apps/mobile/.env")
      return
    }

    setDevSentryBusy(true)
    setDevSentryMessage(null)

    const marker = `mobile-runtime-ui-smoke-${new Date().toISOString()}`
    setDevSentryMarker(marker)

    try {
      Sentry.withScope((scope) => {
        scope.setLevel("warning")
        scope.setTag("smoke", "true")
        scope.setTag("smoke.marker", marker)
        Sentry.captureException(new Error(marker))
        Sentry.captureMessage(marker)
      })
      await Sentry.flush()
      setDevSentryMessage("Відправлено в Sentry. Скопіюй marker нижче і надішли мені для підтвердження.")
    } catch (e: unknown) {
      setDevSentryMessage(`Sentry smoke failed: ${errorToMessage(e)}`)
    } finally {
      setDevSentryBusy(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View className="bg-background flex-1">
        <ScreenHeader title="Налаштування" onBack={() => navigation.goBack()} />

        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        >
          <View className="gap-4">
            {error ? <Text className="text-destructive font-semibold">{error}</Text> : null}

            <View className="gap-2">
              <Text className="text-foreground text-base font-black">Авто-архів</Text>
              <Input
                value={autoArchiveDays}
                onChangeText={setAutoArchiveDays}
                inputMode="numeric"
                keyboardType="number-pad"
                className="bg-background"
              />
              <Text className="text-muted-foreground">
                За замовчуванням: 7 днів з останньої відповіді продавця.
              </Text>
            </View>

            <Card>
              <CardHeader>
                <CardTitle>Push-сповіщення</CardTitle>
                <CardDescription>
                  Системний дозвіл + реєстрація пристрою. Перемикачі нижче керують типами push у вашому робочому
                  просторі.
                </CardDescription>
              </CardHeader>
              <CardContent className="gap-3">
                {isExpoGo ? (
                  <Text className="text-muted-foreground">
                    Expo Go (SDK 53+) не підтримує remote push. Для тесту пушів потрібен dev client.
                  </Text>
                ) : null}

                {!Device.isDevice ? (
                  <Text className="text-muted-foreground">Push працює лише на реальному пристрої.</Text>
                ) : null}

                <View className="flex-row items-center justify-between">
                  <Text className="text-foreground font-medium">Дозвіл</Text>
                  <Text className="text-muted-foreground font-semibold">{permissionLabel(pushPermission)}</Text>
                </View>

                <View className="flex-row items-center justify-between">
                  <Text className="text-foreground font-medium">EAS projectId</Text>
                  <Text className="text-muted-foreground font-semibold">{pushProjectId ?? "не знайдено"}</Text>
                </View>

                {pushTokenPreview ? (
                  <View className="gap-1">
                    <Text className="text-foreground font-medium">Останній push token</Text>
                    <Input value={pushTokenPreview} editable={false} className="bg-background" />
                  </View>
                ) : null}

                {pushRegisteredAt ? (
                  <View className="flex-row items-center justify-between">
                    <Text className="text-foreground font-medium">Зареєстровано на API</Text>
                    <Text className="text-muted-foreground font-semibold">{new Date(pushRegisteredAt).toLocaleString()}</Text>
                  </View>
                ) : null}

                {pushMessage ? <Text className="text-muted-foreground">{pushMessage}</Text> : null}

                <View className="flex-row gap-2">
                  {pushPermission === "granted" ? (
                    <Button
                      className="flex-1"
                      disabled={pushBusy}
                      onPress={() => {
                        void enableOrRegisterPush(false)
                      }}
                    >
                      <Text>{pushBusy ? "..." : "Перереєструвати"}</Text>
                    </Button>
                  ) : (
                    <Button
                      className="flex-1"
                      disabled={pushBusy || isExpoGo}
                      onPress={() => {
                        void enableOrRegisterPush(true)
                      }}
                    >
                      <Text>{pushBusy ? "..." : "Увімкнути push"}</Text>
                    </Button>
                  )}

                  {pushPermission === "denied" && pushCanAskAgain === false ? (
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onPress={() => {
                        void Linking.openSettings()
                      }}
                    >
                      <Text>Налаштування</Text>
                    </Button>
                  ) : null}
                </View>
              </CardContent>
            </Card>

            <View className="flex-row items-center justify-between">
              <Text className="text-foreground font-medium">Push: нові повідомлення</Text>
              <Switch checked={pushNewMessageEnabled} onCheckedChange={setPushNewMessageEnabled} />
            </View>

            <View className="flex-row items-center justify-between">
              <Text className="text-foreground font-medium">Push: помилка відправки</Text>
              <Switch checked={pushSendErrorEnabled} onCheckedChange={setPushSendErrorEnabled} />
            </View>

            <Button disabled={saving || loading || !settings} onPress={() => void save()} className="h-11">
              <Text>{saving ? "Збереження..." : "Зберегти"}</Text>
            </Button>

            {__DEV__ ? (
              <Card>
                <CardHeader>
                  <CardTitle>Diagnostics (dev)</CardTitle>
                  <CardDescription>Runtime smoke для перевірки Sentry на реальному девайсі.</CardDescription>
                </CardHeader>
                <CardContent className="gap-3">
                  {!env.sentryDsn ? (
                    <Text className="text-muted-foreground">
                      Sentry вимкнено (DSN порожній). Заповни{" "}
                      <Text className="font-semibold">EXPO_PUBLIC_SENTRY_DSN</Text> в{" "}
                      <Text className="font-semibold">apps/mobile/.env</Text>.
                    </Text>
                  ) : null}

                  {devSentryMessage ? <Text className="text-muted-foreground">{devSentryMessage}</Text> : null}

                  {devSentryMarker ? (
                    <View className="gap-2">
                      <Text className="text-foreground font-medium">Marker</Text>
                      <Input value={devSentryMarker} editable={false} className="bg-background" />
                    </View>
                  ) : null}

                  <Button
                    disabled={devSentryBusy || !env.sentryDsn}
                    onPress={() => {
                      void sendSentrySmoke()
                    }}
                    className="h-11"
                  >
                    <Text>{devSentryBusy ? "..." : "Send Sentry test"}</Text>
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  )
}

