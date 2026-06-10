"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { useAppStore } from "@/store"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { OlxIntegrationCard } from "@/components/settings/OlxIntegrationCard"
import { PromIntegrationCard } from "@/components/settings/PromIntegrationCard"
import { RozetkaIntegrationCard } from "@/components/settings/RozetkaIntegrationCard"
import { ArrowLeft, Moon, Sun } from "lucide-react"
import { getAccessToken } from "@/lib/tokens"
import {
  getNotificationPermission,
  getUnsupportedPlatformHint,
  playNotificationBeep,
  requestNotificationPermission,
  showBrowserNotification,
  type NotificationPermissionState,
  type UnsupportedPlatformHint,
} from "@/lib/notifications"

export default function SettingsPage() {
  const router = useRouter()
  const token = useMemo(() => getAccessToken(), [])
  const { settings, updateSettings } = useAppStore()

  useEffect(() => {
    if (!token) router.replace("/login?next=/settings")
  }, [router, token])

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 p-3 border-b border-border">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/inbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold">Налаштування</span>
        </div>

        <div className="p-4 space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Загальні</h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {settings.darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                <span className="text-sm">Темна тема</span>
              </div>
              <Switch checked={settings.darkMode} onCheckedChange={(checked) => updateSettings({ darkMode: checked })} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Відкривати одразу на платформі</span>
              <Switch checked={settings.openOnPlatform} onCheckedChange={(checked) => updateSettings({ openOnPlatform: checked })} />
            </div>
          </section>

          <Separator />

          <NotificationsSection />

          <Separator />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Авто-архів</h2>
            <div className="flex items-center justify-between">
              <span className="text-sm">Архівувати неактивні діалоги через</span>
              <Select value={String(settings.autoArchiveDays)} onValueChange={(v) => updateSettings({ autoArchiveDays: Number(v) })}>
                <SelectTrigger className="w-28 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Вимкнено</SelectItem>
                  <SelectItem value="7">7 днів</SelectItem>
                  <SelectItem value="14">14 днів</SelectItem>
                  <SelectItem value="30">30 днів</SelectItem>
                  <SelectItem value="60">60 днів</SelectItem>
                  <SelectItem value="90">90 днів</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">📌 Закріплені діалоги не авто-архівуються</p>
          </section>

          <Separator />

          <OlxIntegrationCard isAuthenticated={Boolean(token)} />

          <Separator />

          <PromIntegrationCard isAuthenticated={Boolean(token)} />

          <Separator />

          <RozetkaIntegrationCard isAuthenticated={Boolean(token)} />
        </div>
      </div>
    </div>
  )
}

function NotificationsSection() {
  const { settings, updateSettings } = useAppStore()
  const [perm, setPerm] = useState<NotificationPermissionState>("default")
  const [unsupportedHint, setUnsupportedHint] = useState<UnsupportedPlatformHint | null>(null)

  useEffect(() => {
    const current = getNotificationPermission()
    setPerm(current)
    setUnsupportedHint(current === "unsupported" ? getUnsupportedPlatformHint() : null)
  }, [])

  const onRequestPermission = async () => {
    const next = await requestNotificationPermission()
    setPerm(next)
  }

  const onTestNotification = () => {
    if (settings.notifications.sound) playNotificationBeep()
    if (settings.notifications.osPopup) {
      showBrowserNotification({
        title: "Тестове сповіщення",
        body: "Це перевірка налаштувань сповіщень.",
        tag: "test",
      })
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Сповіщення</h2>

      <div className="flex items-center justify-between">
        <span className="text-sm">Нові повідомлення</span>
        <Switch
          checked={settings.notifications.messages}
          onCheckedChange={(checked) => updateSettings({ notifications: { ...settings.notifications, messages: checked } })}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm">Помилки відправки</span>
        <Switch
          checked={settings.notifications.errors}
          onCheckedChange={(checked) => updateSettings({ notifications: { ...settings.notifications, errors: checked } })}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm">Системні</span>
        <Switch
          checked={settings.notifications.system}
          onCheckedChange={(checked) => updateSettings({ notifications: { ...settings.notifications, system: checked } })}
        />
      </div>

      <Separator className="my-2" />

      <h3 className="text-xs uppercase text-muted-foreground tracking-wide">Канали доставки</h3>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm">Звуковий сигнал</div>
          <p className="text-[11px] text-muted-foreground">Короткий біп при новому вхідному</p>
        </div>
        <Switch
          checked={settings.notifications.sound}
          onCheckedChange={(checked) => updateSettings({ notifications: { ...settings.notifications, sound: checked } })}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm">Toast у вкладці</div>
          <p className="text-[11px] text-muted-foreground">Спливаюче вікно з кнопкою «Відкрити»</p>
        </div>
        <Switch
          checked={settings.notifications.inAppToast}
          onCheckedChange={(checked) => updateSettings({ notifications: { ...settings.notifications, inAppToast: checked } })}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm">OS-сповіщення</div>
          <p className="text-[11px] text-muted-foreground">
            {perm === "granted" && "Дозволено браузером"}
            {perm === "denied" && "Заблоковано — увімкніть у налаштуваннях браузера"}
            {perm === "default" && "Натисніть «Дозволити» нижче, щоб бачити OS-popup"}
            {perm === "unsupported" && (unsupportedHint?.reason === "ios-tab" ? "iOS Safari у tab" : "Браузер не підтримує сповіщення")}
          </p>
        </div>
        <Switch
          checked={settings.notifications.osPopup && perm === "granted"}
          disabled={perm === "denied" || perm === "unsupported"}
          onCheckedChange={(checked) => updateSettings({ notifications: { ...settings.notifications, osPopup: checked } })}
        />
      </div>

      {perm === "unsupported" && unsupportedHint && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">
          <p>{unsupportedHint.message}</p>
          {unsupportedHint.action && (
            <a
              href={unsupportedHint.action.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block underline underline-offset-2 hover:no-underline"
            >
              {unsupportedHint.action.label} →
            </a>
          )}
        </div>
      )}

      {perm === "default" && (
        <Button variant="outline" size="sm" className="w-full" onClick={onRequestPermission}>
          Дозволити OS-сповіщення
        </Button>
      )}

      <Button variant="ghost" size="sm" className="w-full" onClick={onTestNotification}>
        Надіслати тестове сповіщення
      </Button>
    </section>
  )
}
