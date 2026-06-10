import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { StatusBar } from "expo-status-bar"
import { useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, View } from "react-native"
import type { Socket } from "socket.io-client"

import type { OutboxPayloadV1 } from "@omnichat/contracts"

import { AuthContext, type AuthContextValue } from "../lib/auth-context"
import { api } from "../lib/api"
import { extractConversationIdFromPushData, isExpoGo, registerDeviceForPushNotifications } from "../lib/push"
import { connectSocket } from "../lib/socket"
import { clearTokens, loadTokens, onTokensChanged, setTokens } from "../lib/tokens"
import type { RootStackParamList } from "../navigation/types"
import { useAppStore } from "../store"
import { ChatScreen } from "../screens/ChatScreen"
import { InboxScreen } from "../screens/InboxScreen"
import { LoginScreen } from "../screens/LoginScreen"
import { TemplatesScreen } from "../screens/TemplatesScreen"
import { SettingsScreen } from "../screens/SettingsScreen"
import { ContextScreen } from "../screens/ContextScreen"
import { TagsScreen } from "../screens/TagsScreen"
import { StatusesScreen } from "../screens/StatusesScreen"

const Stack = createNativeStackNavigator<RootStackParamList>()
const navigationRef = createNavigationContainerRef<RootStackParamList>()

export function AppRoot() {
  const [ready, setReady] = useState(false)
  const [accessToken, setAccessTokenState] = useState<string | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)
  const accessTokenRef = useRef<string | null>(null)
  const pendingConversationIdRef = useRef<string | null>(null)
  const lastHandledNotificationKeyRef = useRef<string | null>(null)

  const tryNavigatePending = () => {
    const conversationId = pendingConversationIdRef.current
    if (!conversationId) return
    if (!accessTokenRef.current) return
    if (!navigationRef.isReady()) return
    pendingConversationIdRef.current = null
    navigationRef.navigate("Chat", { conversationId })
  }

  useEffect(() => {
    const unsub = onTokensChanged((t) => setAccessTokenState(t))

    void (async () => {
      await loadTokens()
      setReady(true)
    })()

    return unsub
  }, [])

  useEffect(() => {
    accessTokenRef.current = accessToken
    tryNavigatePending()
  }, [accessToken])

  useEffect(() => {
    if (!accessToken) {
      setSocket(null)
      return
    }

    const s = connectSocket(accessToken)
    setSocket(s)
    return () => {
      s.disconnect()
    }
  }, [accessToken])

  useEffect(() => {
    if (!accessToken) return
    void useAppStore.getState().bootstrap()
  }, [accessToken])

  useEffect(() => {
    if (!socket) return

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
      const patch = typeof data.patch === "object" && data.patch != null ? (data.patch as Record<string, unknown>) : null
      if (!conversationId || !patch) return
      useAppStore.getState().applyConversationPatch(conversationId, patch)
    }

    const onMessageNew = (payload: OutboxPayloadV1) => {
      const key = getEventKey("message.new", payload)
      if (key && shouldSkipEvent(key)) return
      const data = payload.data
      const conversationId = typeof data.conversationId === "string" ? data.conversationId : null
      const message = typeof data.message === "object" && data.message != null ? (data.message as Record<string, unknown>) : null
      if (!conversationId || !message) return
      useAppStore.getState().ingestMessage(conversationId, message)
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

    socket.on("connect", onConnect)
    socket.on("conversation.updated", onConversationUpdated)
    socket.on("message.new", onMessageNew)
    socket.on("message.updated", onMessageUpdated)

    return () => {
      socket.off("connect", onConnect)
      socket.off("conversation.updated", onConversationUpdated)
      socket.off("message.new", onMessageNew)
      socket.off("message.updated", onMessageUpdated)
    }
  }, [socket])

  useEffect(() => {
    if (!accessToken) return

    void (async () => {
      try {
        // Best-effort: only registers if permission is already granted.
        // Permission prompts happen explicitly from Settings UX.
        await registerDeviceForPushNotifications({ interactive: false })
      } catch {
        // best-effort
      }
    })()
  }, [accessToken])

  useEffect(() => {
    if (isExpoGo) return

    let mounted = true
    let sub: { remove: () => void } | null = null

    const handle = (resp: unknown) => {
      const r = resp as { notification?: { request?: { identifier?: unknown; content?: { data?: unknown } } } } | null
      const req = r?.notification?.request
      const data = req?.content?.data
      const conversationId = extractConversationIdFromPushData(data)
      if (!conversationId) return

      const requestId = typeof req?.identifier === "string" ? req.identifier : null
      const key = requestId ? `req:${requestId}` : `conv:${conversationId}`
      if (lastHandledNotificationKeyRef.current === key) return
      lastHandledNotificationKeyRef.current = key

      pendingConversationIdRef.current = conversationId
      tryNavigatePending()
    }

    void (async () => {
      try {
        const Notifications = await import("expo-notifications")
        if (!mounted) return

        sub = Notifications.addNotificationResponseReceivedListener((resp) => handle(resp))

        const last = await Notifications.getLastNotificationResponseAsync()
        if (!mounted) return
        if (last) handle(last)
      } catch {
        // ignore
      }
    })()

    return () => {
      mounted = false
      sub?.remove()
    }
  }, [])

  const auth = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      socket,
      setTokens: async (tokens) => {
        await setTokens(tokens)
      },
      logout: async () => {
        try {
          await api.POST("/v1/auth/logout", {})
        } catch {
          // best-effort
        }
        await clearTokens()
      },
    }),
    [accessToken, socket],
  )

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <AuthContext.Provider value={auth}>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          tryNavigatePending()
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {accessToken ? (
            <>
              <Stack.Screen name="Inbox" component={InboxScreen} options={{ title: "Inbox" }} />
              <Stack.Screen name="Chat" component={ChatScreen} />
              <Stack.Screen name="Templates" component={TemplatesScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="Context" component={ContextScreen} />
              <Stack.Screen name="Tags" component={TagsScreen} />
              <Stack.Screen name="Statuses" component={StatusesScreen} />
            </>
          ) : (
            <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Login" }} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </AuthContext.Provider>
  )
}
