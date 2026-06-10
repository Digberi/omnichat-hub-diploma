"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"

import type { components } from "@omnichat/api-client"

import { api } from "@/lib/api"
import { clearTokens, getAccessToken } from "@/lib/tokens"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { ArrowLeft, Copy, ExternalLink } from "lucide-react"

type ConversationDetailsDto = components["schemas"]["ConversationDetailsDto"]

export default function ContextPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const conversationId = params?.id ?? ""

  const token = useMemo(() => getAccessToken(), [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conversation, setConversation] = useState<ConversationDetailsDto | null>(null)

  useEffect(() => {
    if (!token) {
      router.replace(`/login?next=/context/${encodeURIComponent(conversationId)}`)
      return
    }
    if (!conversationId) return

    let alive = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.GET("/v1/conversations/{conversationId}", {
          params: { path: { conversationId } },
        })
        if (res.response.status === 401) {
          clearTokens()
          router.replace(`/login?next=/context/${encodeURIComponent(conversationId)}`)
          return
        }
        if (!res.data) throw new Error(`Failed: ${res.response.status}`)
        if (!alive) return
        setConversation(res.data as ConversationDetailsDto)
      } catch (e: unknown) {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!alive) return
        setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [conversationId, router, token])

  const externalUrl = conversation?.contextExternalUrl ?? null

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 p-3 border-b border-border">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push(`/chat/${encodeURIComponent(conversationId)}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold">Контекст</span>
        </div>

        {loading ? <p className="p-4 text-sm text-muted-foreground">Loading...</p> : null}
        {error ? <p className="p-4 text-sm text-destructive break-words">{error}</p> : null}

        {!loading && conversation ? (
          <div className="p-4 space-y-4">
            {/* Listing / Order */}
            <div className="space-y-4">
              {conversation.contextThumbUrl ? (
                <img
                  src={conversation.contextThumbUrl}
                  alt={conversation.contextTitle ?? "Контекст"}
                  className="w-full aspect-square rounded-lg object-cover bg-muted"
                />
              ) : (
                <div className="w-full aspect-square rounded-lg bg-muted" />
              )}

              <div>
                <h1 className="text-lg font-bold">{conversation.contextTitle ?? "—"}</h1>
                {conversation.contextPrice != null ? (
                  <p className="text-xl font-semibold text-primary mt-1">
                    {conversation.contextPrice.toLocaleString("uk-UA")} {conversation.contextCurrency ?? ""}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 text-sm">
                {conversation.contextExternalId ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ID</span>
                    <span className="font-mono text-xs">{conversation.contextExternalId}</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Канал</span>
                  <span>{conversation.channel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Акаунт</span>
                  <span>{conversation.channelAccountAlias ?? "—"}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button className="flex-1" asChild disabled={!externalUrl}>
                  <a href={externalUrl ?? "#"} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Відкрити на платформі
                  </a>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!externalUrl) return
                    navigator.clipboard.writeText(externalUrl)
                    toast({ title: "Посилання скопійовано" })
                  }}
                  disabled={!externalUrl}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
