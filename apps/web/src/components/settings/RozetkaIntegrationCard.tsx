"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type ChannelAccountDto = {
  id: string
  channel: "OLX" | "PROM" | "ROZETKA"
  alias: string
  authType: "OAUTH" | "TOKEN"
  isEnabled: boolean
  lastSyncAt?: string | null
  lastError?: string | null
  createdAt: string
  updatedAt: string
}

type Feedback = {
  tone: "success" | "error"
  message: string
}

const rozetkaTokenHelpUrl = "https://sellerhelp.rozetka.com.ua/p282-api-start.html"

function formatDate(value?: string | null): string {
  if (!value) return "Ще не синхронізувався"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Невідома дата"
  return new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function extractApiErrorMessage(error: unknown): string {
  const maybe = error as { data?: { message?: string } }
  if (typeof maybe?.data?.message === "string" && maybe.data.message.length > 0) {
    return maybe.data.message
  }
  if (error instanceof Error && error.message.length > 0) return error.message
  return "Не вдалося виконати запит до API"
}

export function RozetkaIntegrationCard({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [accounts, setAccounts] = useState<ChannelAccountDto[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [alias, setAlias] = useState("")
  const [apiToken, setApiToken] = useState("")
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const currentAccount = useMemo(() => accounts[0] ?? null, [accounts])

  const loadAccounts = useCallback(async () => {
    if (!isAuthenticated) return
    setIsLoading(true)
    try {
      const res = await api.GET("/v1/channel-accounts")
      const next = (res.data ?? []).filter((item) => item.channel === "ROZETKA") as ChannelAccountDto[]
      setAccounts(next)
      if (next[0]?.alias) setAlias((prev) => (prev.trim().length > 0 ? prev : next[0]!.alias))
    } catch (error) {
      setFeedback({
        tone: "error",
        message: extractApiErrorMessage(error),
      })
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  const submit = useCallback(async () => {
    const token = apiToken.trim()
    if (!token) {
      setFeedback({ tone: "error", message: "Встав API-токен Rozetka." })
      return
    }

    setIsSubmitting(true)
    setFeedback(null)
    try {
      const res = await api.POST("/v1/channel-accounts/rozetka/connect", {
        body: {
          apiToken: token,
          ...(alias.trim().length > 0 ? { alias: alias.trim() } : {}),
          ...(currentAccount ? { channelAccountId: currentAccount.id } : {}),
        },
      })

      if (!res.data) throw new Error("ROZETKA connect returned empty response")

      setApiToken("")
      setFeedback({
        tone: "success",
        message: currentAccount
          ? "Токен Rozetka оновлено. Акаунт знову готовий до синхронізації."
          : "Rozetka підключено. Акаунт готовий до наступного етапу інтеграції.",
      })
      await loadAccounts()
    } catch (error) {
      setFeedback({
        tone: "error",
        message: extractApiErrorMessage(error),
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [alias, apiToken, currentAccount, loadAccounts])

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Інтеграція Rozetka</h2>
        <p className="text-xs text-muted-foreground">
          Підключає токен продавця Rozetka. Для валідації потрібна роль з доступом до API листування.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{currentAccount ? currentAccount.alias : "Rozetka ще не підключено"}</div>
              <div className="text-xs text-muted-foreground">
                {currentAccount ? `Остання синхронізація: ${formatDate(currentAccount.lastSyncAt)}` : "Створи API-токен у кабінеті продавця Rozetka і встав його нижче."}
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                currentAccount?.isEnabled
                  ? "bg-emerald-500/15 text-emerald-700"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {currentAccount?.isEnabled ? "Активно" : "Не підключено"}
            </span>
          </div>

          {currentAccount?.lastError ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
              Остання помилка синхронізації: {currentAccount.lastError}
            </div>
          ) : null}

          {feedback ? (
            <div
              className={`rounded-xl border px-3 py-2 text-xs ${
                feedback.tone === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
                  : "border-red-500/30 bg-red-500/10 text-red-800"
              }`}
            >
              {feedback.message}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Аліас магазину</label>
            <Input
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="Наприклад, Rozetka основний магазин"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">API-токен Rozetka</label>
            <Input
              value={apiToken}
              onChange={(event) => setApiToken(event.target.value)}
              type="password"
              placeholder="Встав токен з кабінету Rozetka"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void submit()} disabled={!isAuthenticated || isSubmitting}>
            {isSubmitting ? "Зберігаю..." : currentAccount ? "Оновити токен" : "Підключити Rozetka"}
          </Button>
          <Button variant="outline" onClick={() => void loadAccounts()} disabled={!isAuthenticated || isLoading}>
            {isLoading ? "Оновлюю..." : "Оновити статус"}
          </Button>
        </div>

        <div className="rounded-xl bg-muted/50 px-3 py-3 text-xs text-muted-foreground space-y-1">
          <div>Як отримати токен: кабінет продавця Rozetka → API → створити окремий API-токен для ролі з доступом до листування.</div>
          <a className="underline underline-offset-2" href={rozetkaTokenHelpUrl} target="_blank" rel="noreferrer">
            Інструкція Rozetka щодо API
          </a>
        </div>
      </div>
    </section>
  )
}
