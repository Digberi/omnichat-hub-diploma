"use client"

import "../observability"

import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { toast as sonnerToast } from "sonner"

import type { OutboxPayloadV1 } from "@omnichat/contracts"

import { ThemeProvider } from "@/components/ThemeProvider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as Sonner } from "@/components/ui/sonner"
import { createRealtimeSocket } from "@/lib/realtime"
import {
  bumpUnreadIndicator,
  getNotificationPermission,
  installVisibilityAutoClear,
  playNotificationBeep,
  requestNotificationPermission,
  showBrowserNotification,
} from "@/lib/notifications"
import { getAccessToken, refreshAccessToken } from "@/lib/tokens"
import { useAppStore } from "@/store"

const TOKENS_EVENT = "omnichat.tokens"

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [token, setToken] = useState<string | null>(() => getAccessToken())

  useEffect(() => {
    const onTokens = () => setToken(getAccessToken())
    window.addEventListener(TOKENS_EVENT, onTokens)
    return () => window.removeEventListener(TOKENS_EVENT, onTokens)
  }, [])

  useEffect(() => {
    if (!token) return
    void useAppStore.getState().bootstrap()
  }, [token])

  useEffect(() => {
    if (!token) return

    const socket = createRealtimeSocket()
    const seenEvents = new Map<string, number>()

    const shouldSkipEvent = (key: string): boolean => {
      const now = Date.now()
      for (const [k, exp] of seenEvents) {
        if (exp <= now) seenEvents.delete(k)
      }
      if (seenEvents.has(key)) return true
      seenEvents.set(key, now + 30_000)
      return false
    }

    const getEventKey = (eventName: string, payload: OutboxPayloadV1): string | null => {
      const data = payload.data as Record<string, unknown>
      const occurredAt = typeof payload.occurredAt === "string" ? payload.occurredAt : ""
      if (eventName === "message.new") {
        const cid = typeof data.conversationId === "string" ? data.conversationId : ""
        const msg = data.message as Record<string, unknown> | undefined
        const messageId = msg && typeof msg.id === "string" ? msg.id : ""
        return messageId ? `${eventName}:${cid}:${messageId}:${occurredAt}` : null
      }
      if (eventName === "message.updated") {
        const messageId = typeof data.messageId === "string" ? data.messageId : ""
        return messageId ? `${eventName}:${messageId}:${occurredAt}` : null
      }
      if (eventName === "conversation.updated") {
        const cid = typeof data.conversationId === "string" ? data.conversationId : ""
        const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : ""
        return cid ? `${eventName}:${cid}:${updatedAt}:${occurredAt}` : null
      }
      return null
    }

    const onConnect = () => {
      void useAppStore.getState().refreshInbox()
    }

    const onConversationUpdated = (payload: OutboxPayloadV1) => {
      const key = getEventKey("conversation.updated", payload)
      if (key && shouldSkipEvent(key)) return
      const data = payload.data
      const conversationId = typeof data.conversationId === "string" ? data.conversationId : null
      const patch =
        typeof data.patch === "object" && data.patch != null ? (data.patch as Record<string, unknown>) : null
      if (!conversationId || !patch) return
      useAppStore.getState().applyConversationPatch(conversationId, patch)
    }

    const onMessageNew = (payload: OutboxPayloadV1) => {
      const key = getEventKey("message.new", payload)
      if (key && shouldSkipEvent(key)) return
      const data = payload.data
      const conversationId = typeof data.conversationId === "string" ? data.conversationId : null
      const message =
        typeof data.message === "object" && data.message != null ? (data.message as Record<string, unknown>) : null
      if (!conversationId || !message) return
      useAppStore.getState().ingestMessage(conversationId, message)

      // Notification UX for inbound only — outbound messages are the
      // operator's own sends, ringing the bell for them would be noise.
      const direction = (message as { direction?: unknown }).direction
      if (direction !== "IN") return
      const notifSettings = useAppStore.getState().settings.notifications
      if (!notifSettings.messages) return // master switch off
      bumpUnreadIndicator()
      if (notifSettings.sound) playNotificationBeep()
      const text = typeof (message as { text?: unknown }).text === "string" ? ((message as { text?: string }).text as string) : ""
      const conv = useAppStore.getState().conversations.find((c) => c.id === conversationId)
      const title = conv?.buyerName || "Нове повідомлення"
      const body = text || "📎 Вкладення"

      // In-app toast (always works, no permission needed) + OS-level
      // notification (when the user has granted permission). The favicon
      // dot + tab title pulse already cover the "I'm in another tab"
      // case; the toast is the "I'm looking at the inbox but the new
      // chat isn't the selected one" case.
      //
      // If notification permission is still `default` (user never
      // granted), surface that in the toast action so they have a
      // visible affordance. Otherwise the toast's action just opens
      // the chat. We can't change the action mid-toast, so we pick the
      // label based on current permission state.
      const perm = getNotificationPermission()
      const fireOsNotification = () => {
        if (!notifSettings.osPopup) return
        showBrowserNotification({
          title,
          body,
          tag: `conv:${conversationId}`,
          onClick: () => useAppStore.getState().selectConversation(conversationId),
        })
      }
      if (notifSettings.inAppToast) {
        if (perm === "default" && notifSettings.osPopup) {
          sonnerToast(title, {
            description: body.slice(0, 200),
            action: {
              label: "Дозволити сповіщення",
              onClick: () => {
                void requestNotificationPermission().then(fireOsNotification)
              },
            },
          })
        } else if (perm === "denied" && notifSettings.osPopup) {
          sonnerToast(title, {
            description: `${body.slice(0, 150)} · OS-сповіщення вимкнено`,
            action: {
              label: "Відкрити",
              onClick: () => useAppStore.getState().selectConversation(conversationId),
            },
          })
        } else {
          sonnerToast(title, {
            description: body.slice(0, 200),
            action: {
              label: "Відкрити",
              onClick: () => useAppStore.getState().selectConversation(conversationId),
            },
          })
        }
      }
      fireOsNotification()
    }

    const onMessageUpdated = (payload: OutboxPayloadV1) => {
      const key = getEventKey("message.updated", payload)
      if (key && shouldSkipEvent(key)) return
      const data = payload.data
      const messageId = typeof data.messageId === "string" ? data.messageId : null
      const patch = typeof data.patch === "object" && data.patch != null ? (data.patch as Record<string, unknown>) : null
      if (!messageId || !patch) return
      useAppStore.getState().applyMessagePatch(messageId, patch)
    }

    // When the cached access token has expired (15 min lifespan) but the
    // tab has been idle so the HTTP layer never refreshed it, the WS
    // auth middleware returns `Unauthorized` and socket.io reconnects
    // in an infinite loop with the same stale token. Refreshing here
    // unsticks the loop — the next reconnect's `auth()` callback reads
    // the freshly-stored token. De-duped server-side via
    // refreshInFlight in `lib/tokens.ts`.
    const onConnectError = (err: Error) => {
      if (err?.message !== "Unauthorized") return
      void refreshAccessToken()
    }

    socket.on("connect", onConnect)
    socket.on("connect_error", onConnectError)
    socket.on("conversation.updated", onConversationUpdated)
    socket.on("message.new", onMessageNew)
    socket.on("message.updated", onMessageUpdated)

    const detachVisibility = installVisibilityAutoClear()

    return () => {
      socket.off("connect", onConnect)
      socket.off("connect_error", onConnectError)
      socket.off("conversation.updated", onConversationUpdated)
      socket.off("message.new", onMessageNew)
      socket.off("message.updated", onMessageUpdated)
      socket.disconnect()
      detachVisibility()
    }
  }, [token])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          {children}
          <Toaster />
          <Sonner />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
