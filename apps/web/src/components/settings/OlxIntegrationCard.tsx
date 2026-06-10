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

export function OlxIntegrationCard({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [accounts, setAccounts] = useState<ChannelAccountDto[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [startingForAccountId, setStartingForAccountId] = useState<string | "new" | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [editingAliasFor, setEditingAliasFor] = useState<string | null>(null)
  const [aliasDraft, setAliasDraft] = useState("")
  const [savingAlias, setSavingAlias] = useState(false)

  const olxAccounts = useMemo(
    () => accounts.filter((a) => a.channel === "OLX"),
    [accounts],
  )

  const loadAccounts = useCallback(async () => {
    if (!isAuthenticated) return
    setIsLoading(true)
    try {
      const res = await api.GET("/v1/channel-accounts")
      setAccounts((res.data ?? []) as ChannelAccountDto[])
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

  useEffect(() => {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    if (url.searchParams.get("oauth") !== "olx") return

    const status = url.searchParams.get("status")
    const error = url.searchParams.get("error")
    if (status === "linked") {
      setFeedback({ tone: "success", message: "OLX успішно підключено. Акаунт готовий до синхронізації." })
      void loadAccounts()
    } else if (error) {
      setFeedback({ tone: "error", message: error })
    }

    url.searchParams.delete("oauth")
    url.searchParams.delete("status")
    url.searchParams.delete("error")
    url.searchParams.delete("channelAccountId")
    window.history.replaceState({}, "", url.toString())
  }, [loadAccounts])

  const startOauth = useCallback(
    async (channelAccountId: string | null) => {
      setStartingForAccountId(channelAccountId ?? "new")
      setFeedback(null)
      try {
        const redirectTo = `${window.location.origin}/settings`
        const res = await api.GET("/v1/channel-accounts/olx/start", {
          params: {
            query: {
              redirectTo,
              ...(channelAccountId ? { channelAccountId } : {}),
            },
          },
        })

        if (res.error || !res.data?.url)
          throw new Error(JSON.stringify(res.error ?? "OLX start returned empty response"))

        window.location.href = String(res.data.url)
      } catch (error) {
        setFeedback({
          tone: "error",
          message: extractApiErrorMessage(error),
        })
        setStartingForAccountId(null)
      }
    },
    [],
  )

  const beginAliasEdit = useCallback((account: ChannelAccountDto) => {
    setEditingAliasFor(account.id)
    setAliasDraft(account.alias)
  }, [])

  const cancelAliasEdit = useCallback(() => {
    setEditingAliasFor(null)
    setAliasDraft("")
  }, [])

  const saveAlias = useCallback(
    async (channelAccountId: string) => {
      const trimmed = aliasDraft.trim()
      if (!trimmed) {
        setFeedback({ tone: "error", message: "Псевдонім не може бути порожнім" })
        return
      }
      setSavingAlias(true)
      setFeedback(null)
      try {
        const res = await api.PATCH("/v1/channel-accounts/{channelAccountId}/alias", {
          params: { path: { channelAccountId } },
          body: { alias: trimmed },
        })
        if (res.error) throw new Error(JSON.stringify(res.error))
        setAccounts((prev) =>
          prev.map((a) => (a.id === channelAccountId ? { ...a, alias: trimmed } : a)),
        )
        setEditingAliasFor(null)
        setAliasDraft("")
        setFeedback({ tone: "success", message: "Псевдонім збережено" })
      } catch (error) {
        setFeedback({ tone: "error", message: extractApiErrorMessage(error) })
      } finally {
        setSavingAlias(false)
      }
    },
    [aliasDraft],
  )

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Інтеграція OLX Україна</h2>
        <p className="text-xs text-muted-foreground">
          Підключається через офіційний OAuth-флоу olx.ua. Після авторизації OmniChat зможе читати чати і відправляти
          відповіді від твого імені без зберігання пароля. Кожному підключеному акаунту можна задати псевдонім — це
          допомагає швидко орієнтуватися, коли активних магазинів кілька (наприклад «тапочки», «сумки»).
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        {olxAccounts.length === 0 ? (
          <div className="space-y-1">
            <div className="text-sm font-medium">OLX ще не підключено</div>
            <div className="text-xs text-muted-foreground">
              Натисни кнопку нижче, щоб перейти на OLX і дозволити доступ.
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {olxAccounts.map((account) => {
              const isEditing = editingAliasFor === account.id
              const isReconnecting = startingForAccountId === account.id
              return (
                <li
                  key={account.id}
                  className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      {isEditing ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            autoFocus
                            value={aliasDraft}
                            onChange={(e) => setAliasDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveAlias(account.id)
                              if (e.key === "Escape") cancelAliasEdit()
                            }}
                            disabled={savingAlias}
                            className="h-7 max-w-[220px] text-sm"
                            aria-label={`Псевдонім для OLX-акаунту ${account.alias}`}
                            placeholder="Назва, наприклад «тапочки»"
                          />
                          <Button
                            size="sm"
                            onClick={() => void saveAlias(account.id)}
                            disabled={savingAlias}
                          >
                            {savingAlias ? "Зберігаю..." : "Зберегти"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelAliasEdit} disabled={savingAlias}>
                            Скасувати
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => beginAliasEdit(account)}
                          className="text-left text-sm font-medium hover:underline"
                          title="Клікни, щоб змінити псевдонім"
                        >
                          {account.alias}
                        </button>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Остання синхронізація: {formatDate(account.lastSyncAt)}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${
                        account.isEnabled
                          ? "bg-emerald-500/15 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {account.isEnabled ? "Активно" : "Не підключено"}
                    </span>
                  </div>

                  {account.lastError ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800">
                      Остання помилка: {account.lastError}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void startOauth(account.id)}
                      disabled={!isAuthenticated || startingForAccountId !== null}
                    >
                      {isReconnecting ? "Переходимо..." : "Перепідключити"}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {feedback ? (
          <div
            role={feedback.tone === "error" ? "alert" : "status"}
            aria-live={feedback.tone === "error" ? "assertive" : "polite"}
            className={`rounded-xl border px-3 py-2 text-xs ${
              feedback.tone === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
                : "border-red-500/30 bg-red-500/10 text-red-800"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
          <Button
            onClick={() => void startOauth(null)}
            disabled={!isAuthenticated || startingForAccountId !== null}
          >
            {startingForAccountId === "new"
              ? "Переходимо..."
              : olxAccounts.length === 0
                ? "Підключити OLX"
                : "Підключити ще один OLX"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void loadAccounts()}
            disabled={!isAuthenticated || isLoading}
          >
            {isLoading ? "Оновлюю..." : "Оновити статус"}
          </Button>
        </div>

        <div className="rounded-xl bg-muted/50 px-3 py-3 text-xs text-muted-foreground space-y-1">
          <div>Після натискання відкриється офіційна сторінка OLX, де потрібно підтвердити доступ для OmniChat.</div>
          <div>
            Повернення в OmniChat відбудеться автоматично через захищений callback. За замовчуванням можна
            підключити лише один OLX-акаунт; ліміт підвищується персонально на запит.
          </div>
        </div>
      </div>
    </section>
  )
}
