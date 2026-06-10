import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Alert,
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  SectionList,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import type { components } from "@omnichat/api-client"
import { channelColorTokens } from "@omnichat/ui-tokens"
import {
  ArrowLeft,
  CheckCircle2 as StatusesIcon,
  Clock as SnoozeIcon,
  FileText as TemplatesIcon,
  LogOut as LogOutIcon,
  Pin as PinIcon,
  Plus as PlusIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Tag as TagsIcon,
} from "lucide-react-native"

import { Avatar, AvatarFallback, AvatarImage, Button, Card, Checkbox, Icon, Input, Text } from "@/components/ui"
import { cn } from "@/registry/nativewind/lib/utils"

import { api } from "../lib/api"
import { useAuth } from "../lib/auth-context"
import { formatFullTime, formatMessageTime, hsl } from "../lib/date-utils"
import type { RootStackParamList } from "../navigation/types"
import { useAppStore, type InboxTab } from "../store"
import type { Conversation, Status, Tag } from "../types"

type Props = NativeStackScreenProps<RootStackParamList, "Inbox">

type SearchConversationHitDto = components["schemas"]["SearchConversationHitDto"]
type SearchMessageHitDto = components["schemas"]["SearchMessageHitDto"]
type SearchResponseDto = components["schemas"]["SearchResponseDto"]

const channelColor: Record<Conversation["channelType"], string> = {
  olx: channelColorTokens.OLX,
  prom: channelColorTokens.PROM,
} as const

const tabs: { value: InboxTab; label: string }[] = [
  { value: "all", label: "Усі" },
  { value: "unread", label: "Непрочитані" },
  { value: "olx", label: "OLX" },
  { value: "prom", label: "Prom" },
  { value: "snoozed", label: "Відкладені" },
  { value: "archive", label: "Архів" },
]

const FAB_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.18,
  shadowOffset: { width: 0, height: 6 },
  shadowRadius: 10,
  elevation: 4,
} as const

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const initials = parts
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
  return initials.toUpperCase()
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.trim().replace("#", "")
  if (normalized.length !== 6) return hex
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function SwipeRow({
  leftLabel,
  rightLabel,
  onSwipeRight,
  onSwipeLeft,
  children,
}: {
  leftLabel: string
  rightLabel: string
  onSwipeRight: () => void
  onSwipeLeft: () => void
  children: ReactNode
}) {
  const translateX = useRef(new Animated.Value(0)).current
  const actionWidth = 92
  const triggerThreshold = 64

  const reset = useCallback(() => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start()
  }, [translateX])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => {
          translateX.setValue(clamp(g.dx, -actionWidth, actionWidth))
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx <= -triggerThreshold) onSwipeLeft()
          else if (g.dx >= triggerThreshold) onSwipeRight()
          reset()
        },
        onPanResponderTerminate: reset,
        onPanResponderTerminationRequest: () => true,
      }),
    [actionWidth, onSwipeLeft, onSwipeRight, reset, translateX],
  )

  return (
    <View className="relative overflow-hidden">
      <View className="absolute inset-0 flex-row">
        <View className="bg-primary/10 flex-1 items-start justify-center px-4">
          <Text className="text-foreground text-xs font-black">{leftLabel}</Text>
        </View>
        <View className="bg-destructive/10 flex-1 items-end justify-center px-4">
          <Text className="text-foreground text-xs font-black">{rightLabel}</Text>
        </View>
      </View>

      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  )
}

function ConversationRow({
  conversation,
  status,
  tags,
  onPress,
}: {
  conversation: Conversation
  status: Status | null
  tags: Tag[]
  onPress: () => void
}) {
  const extraTags = Math.max(0, conversation.tagIds.length - 4)
  const initials = initialsFromName(conversation.buyerName)

  return (
    <Button
      variant="ghost"
      onPress={onPress}
      className="active:bg-muted/50 h-auto flex-row items-start justify-start gap-3 rounded-none border-b border-border px-0 py-3"
    >
      <View className="relative h-11 w-11">
        <Avatar className="size-10" alt={conversation.buyerName}>
          {conversation.buyerAvatar ? <AvatarImage source={{ uri: conversation.buyerAvatar }} /> : null}
          <AvatarFallback>
            <Text className="text-muted-foreground font-black">{initials}</Text>
          </AvatarFallback>
        </Avatar>

        <View
          className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border-2 border-background"
          style={{ backgroundColor: channelColor[conversation.channelType] }}
        />
        {conversation.isOnline ? (
          <View className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-green-600" />
        ) : null}
      </View>

      <View className="flex-1 gap-1">
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-1 flex-row items-center gap-1.5">
            <Text className="text-foreground flex-shrink text-sm font-extrabold" numberOfLines={1}>
              {conversation.buyerName}
            </Text>
            {conversation.buyerHistory?.isRepeatBuyer ? <Text className="text-xs">⭐</Text> : null}
            {conversation.isPinned ? <Icon as={PinIcon} className="text-muted-foreground" size={14} /> : null}
            {conversation.isSnoozed ? <Icon as={SnoozeIcon} className="text-muted-foreground" size={14} /> : null}
          </View>
          <Text className="text-muted-foreground text-xs">{formatMessageTime(conversation.lastMessageTime)}</Text>
        </View>

        <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
          {conversation.accountAlias ?? "—"}
        </Text>

        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-muted-foreground flex-1 text-xs" numberOfLines={1}>
            {conversation.lastMessage}
          </Text>
          <View className="flex-row items-center gap-1.5">
            {conversation.needsReply ? <View className="bg-destructive h-2 w-2 rounded-full" /> : null}
            {conversation.unreadCount > 0 ? (
              <View className="bg-foreground min-w-5 h-5 items-center justify-center rounded-full px-1.5">
                <Text className="text-background text-[10px] font-black">{conversation.unreadCount}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="flex-row flex-wrap items-center gap-1.5">
          {status ? (
            <View className="rounded-xl px-2 py-1" style={{ backgroundColor: hsl(status.color, 0.12) }}>
              <Text className="text-[10px] font-extrabold" style={{ color: hsl(status.color) }} numberOfLines={1}>
                {status.icon} {status.name}
              </Text>
            </View>
          ) : null}

          {tags.map((t) => (
            <Text key={t.id} className="text-xs">
              {t.icon}
            </Text>
          ))}
          {extraTags > 0 ? <Text className="text-muted-foreground text-[10px] font-semibold">+{extraTags}</Text> : null}
        </View>
      </View>
    </Button>
  )
}

function InboxDashboard() {
  const conversations = useAppStore((s) => s.conversations)
  const inboxMetrics = useAppStore((s) => s.inboxMetrics)

  const stats = useMemo(() => {
    const active = conversations.filter((c) => !c.isArchived)
    const needsReply = active.filter((c) => c.needsReply).length
    const unread = active.filter((c) => c.unreadCount > 0).length
    const snoozed = active.filter((c) => c.isSnoozed).length
    const avgResponseMin = inboxMetrics?.avgResponseMin ?? null
    const hourlyActivity = Array.isArray(inboxMetrics?.hourlyActivity) ? inboxMetrics.hourlyActivity : Array(24).fill(0)
    return { needsReply, unread, snoozed, avgResponseMin, total: active.length, hourlyActivity }
  }, [conversations, inboxMetrics])

  const max = Math.max(...stats.hourlyActivity)
  const nowHour = new Date().getHours()

  return (
    <View className="border-border gap-2 border-b px-3 pt-2.5 pb-2.5">
      <View className="flex-row gap-2">
        <StatCard label="Потребують\nвідповіді" value={`${stats.needsReply}`} tone="primary" />
        <StatCard label="Непрочитаних" value={`${stats.unread}`} tone="danger" />
        <StatCard
          label="Сер. відповідь"
          value={stats.avgResponseMin != null ? `${stats.avgResponseMin} хв` : "—"}
          tone="olx"
        />
        <StatCard label="Активних" value={`${stats.total}`} tone="prom" />
      </View>

      <View className="h-7 flex-row items-end gap-0.5">
        {stats.hourlyActivity.map((val, i) => {
          const heightPct = max > 0 ? (val / max) * 100 : 0
          return (
            <View
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              className={cn("flex-1 rounded-t-sm", i === nowHour ? "bg-foreground" : "bg-muted")}
              style={{ height: `${Math.max(heightPct, 12)}%` }}
            />
          )
        })}
      </View>

      <View className="flex-row justify-between">
        <Text className="text-muted-foreground text-[9px] font-semibold">00</Text>
        <Text className="text-muted-foreground text-[9px] font-semibold">06</Text>
        <Text className="text-muted-foreground text-[9px] font-semibold">12</Text>
        <Text className="text-muted-foreground text-[9px] font-semibold">18</Text>
        <Text className="text-muted-foreground text-[9px] font-semibold">23</Text>
      </View>
    </View>
  )
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "primary" | "danger" | "olx" | "prom"
}) {
  const bg =
    tone === "primary"
      ? hexToRgba("#111111", 0.06)
      : tone === "danger"
        ? hexToRgba("#dc2626", 0.08)
        : tone === "olx"
          ? hexToRgba(channelColorTokens.OLX, 0.08)
          : hexToRgba(channelColorTokens.PROM, 0.08)

  const fgClassName =
    tone === "primary"
      ? "text-foreground"
      : tone === "danger"
        ? "text-destructive"
        : tone === "olx"
          ? "text-orange-600"
          : "text-blue-600"

  return (
    <Card className="flex-1 gap-1 rounded-xl border-0 py-2 px-2 shadow-none" style={{ backgroundColor: bg }}>
      <Text className={cn("text-center text-lg font-black", fgClassName)}>{value}</Text>
      <Text className="text-muted-foreground text-center text-[10px] font-semibold">{label}</Text>
    </Card>
  )
}

function SearchModal({
  open,
  onClose,
  onOpenConversation,
  onOpenMessage,
}: {
  open: boolean
  onClose: () => void
  onOpenConversation: (conversationId: string) => void
  onOpenMessage: (conversationId: string, messageId: string) => void
}) {
  const searchQuery = useAppStore((s) => s.searchQuery)
  const setSearchQuery = useAppStore((s) => s.setSearchQuery)

  const [showOlder, setShowOlder] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversations, setConversations] = useState<SearchConversationHitDto[]>([])
  const [messages, setMessages] = useState<SearchMessageHitDto[]>([])

  const fetchSearch = useCallback(async () => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setConversations([])
      setMessages([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const queryParams = showOlder ? { query: q, showOlder: "true", limit: 50 } : { query: q, limit: 50 }
      const res = await api.GET("/v1/search", {
        params: {
          query: queryParams,
        },
      })
      if (!res.data) throw new Error("no data")
      const data = res.data as SearchResponseDto
      setConversations(Array.isArray(data.conversations) ? data.conversations : [])
      setMessages(Array.isArray(data.messages) ? data.messages : [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [searchQuery, showOlder])

  return (
    <Modal
      visible={open}
      animationType="slide"
      onRequestClose={() => {
        setSearchQuery("")
        setShowOlder(false)
        onClose()
      }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View className="bg-background flex-1">
          <View className="border-border flex-row items-center gap-2 border-b px-3 py-2.5">
            <Button
              variant="ghost"
              size="icon"
              onPress={() => {
                setSearchQuery("")
                setShowOlder(false)
                onClose()
              }}
              className="bg-muted h-9 w-9 rounded-xl"
            >
              <Icon as={ArrowLeft} className="text-foreground" size={18} />
            </Button>
            <Input
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Пошук (діалоги + повідомлення)"
              className="bg-muted flex-1"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => void fetchSearch()}
              returnKeyType="search"
            />
            <Button variant="secondary" size="icon" onPress={() => void fetchSearch()} className="h-9 w-9">
              <Icon as={SearchIcon} className="text-secondary-foreground" size={18} />
            </Button>
          </View>

          <View className="flex-row items-center justify-between px-3 py-2.5">
            <Button
              variant="secondary"
              onPress={() => setShowOlder((v) => !v)}
              className="h-auto flex-row items-center justify-start gap-2 rounded-xl px-3 py-2"
            >
              <View className="flex-row items-center gap-2">
                <View pointerEvents="none">
                  <Checkbox checked={showOlder} onCheckedChange={() => {}} />
                </View>
                <Text className="text-foreground font-extrabold">Показати старі</Text>
              </View>
            </Button>
            <Text className="text-muted-foreground text-xs">За замовчуванням: 7 днів</Text>
          </View>

          {loading ? (
            <View className="items-center p-6">
              <ActivityIndicator />
            </View>
          ) : error ? (
            <View className="items-center p-6">
              <Text className="text-destructive font-semibold">{error}</Text>
            </View>
          ) : (
            <SectionList
              sections={[
                ...(conversations.length > 0 ? [{ title: "Діалоги", data: conversations as unknown as any[] }] : []),
                ...(messages.length > 0 ? [{ title: "Повідомлення", data: messages as unknown as any[] }] : []),
              ]}
              keyExtractor={(item: any) => item.id}
              renderSectionHeader={({ section }) => (
                <Text className="text-muted-foreground px-3 pt-3 pb-2 text-[10px] font-black uppercase">
                  {section.title}
                </Text>
              )}
              renderItem={({ item, section }) => {
                if (section.title === "Діалоги") {
                  const c = item as SearchConversationHitDto
                  return (
                    <Button
                      variant="secondary"
                      onPress={() => {
                        onOpenConversation(c.id)
                        setSearchQuery("")
                        onClose()
                      }}
                      className="active:bg-muted/40 h-auto flex-col items-start justify-start gap-1 rounded-none border-b border-border bg-transparent px-3 py-3"
                    >
                      <Text className="text-foreground text-sm font-extrabold">{c.buyerDisplayName}</Text>
                      {c.contextTitle ? <Text className="text-muted-foreground text-xs">{c.contextTitle}</Text> : null}
                    </Button>
                  )
                }

                const m = item as SearchMessageHitDto
                return (
                  <Button
                    variant="secondary"
                    onPress={() => {
                      onOpenMessage(m.conversationId, m.id)
                      setSearchQuery("")
                      onClose()
                    }}
                    className="active:bg-muted/40 h-auto flex-col items-start justify-start gap-1 rounded-none border-b border-border bg-transparent px-3 py-3"
                  >
                    <Text className="text-foreground text-sm font-extrabold" numberOfLines={2}>
                      {m.text ?? "—"}
                    </Text>
                    <Text className="text-muted-foreground text-xs">{formatFullTime(m.createdAt)}</Text>
                  </Button>
                )
              }}
              ListEmptyComponent={
                searchQuery.trim().length < 2 ? (
                  <View className="items-center p-6">
                    <Text className="text-muted-foreground font-semibold">Введіть мінімум 2 символи</Text>
                  </View>
                ) : (
                  <View className="items-center p-6">
                    <Text className="text-muted-foreground font-semibold">Немає результатів</Text>
                  </View>
                )
              }
              contentContainerStyle={{ paddingBottom: 12 }}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  )
}

export function InboxScreen({ navigation }: Props) {
  const auth = useAuth()

  const bootstrapping = useAppStore((s) => s.bootstrapping)
  const bootstrapError = useAppStore((s) => s.bootstrapError)
  const refreshInbox = useAppStore((s) => s.refreshInbox)
  const conversations = useAppStore((s) => s.conversations)
  const tags = useAppStore((s) => s.tags)
  const statuses = useAppStore((s) => s.statuses)
  const selectConversation = useAppStore((s) => s.selectConversation)
  const jumpToMessage = useAppStore((s) => s.jumpToMessage)
  const pinConversation = useAppStore((s) => s.pinConversation)
  const unpinConversation = useAppStore((s) => s.unpinConversation)
  const archiveConversation = useAppStore((s) => s.archiveConversation)
  const unarchiveConversation = useAppStore((s) => s.unarchiveConversation)

  const [activeTab, setActiveTab] = useState<InboxTab>("all")
  const [searchOpen, setSearchOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t] as const)), [tags])
  const statusesById = useMemo(() => new Map(statuses.map((s) => [s.id, s] as const)), [statuses])

  const totalUnread = useMemo(() => conversations.filter((c) => c.needsReply && !c.isArchived).length, [conversations])
  const snoozedCount = useMemo(() => conversations.filter((c) => c.isSnoozed && !c.isArchived).length, [conversations])

  const filtered = useMemo(() => {
    switch (activeTab) {
      case "all":
        return conversations.filter((c) => !c.isArchived && !c.isSnoozed)
      case "unread":
        return conversations.filter((c) => c.needsReply && !c.isArchived)
      case "olx":
        return conversations.filter((c) => c.channelType === "olx" && !c.isArchived && !c.isSnoozed)
      case "prom":
        return conversations.filter((c) => c.channelType === "prom" && !c.isArchived && !c.isSnoozed)
      case "snoozed":
        return conversations.filter((c) => c.isSnoozed && !c.isArchived)
      case "archive":
        return conversations.filter((c) => c.isArchived)
      default:
        return conversations
    }
  }, [activeTab, conversations])

  const pinned = useMemo(() => filtered.filter((c) => c.isPinned), [filtered])
  const unpinned = useMemo(() => filtered.filter((c) => !c.isPinned), [filtered])

  const sections = useMemo(() => {
    if (activeTab === "all" && pinned.length > 0) {
      return [
        { title: "📌 Закріплені", data: pinned },
        { title: "", data: unpinned },
      ]
    }
    return [{ title: "", data: filtered }]
  }, [activeTab, filtered, pinned, unpinned])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refreshInbox()
    } finally {
      setRefreshing(false)
    }
  }, [refreshInbox])

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View className="bg-background flex-1">
        <View className="border-border flex-row items-center justify-between border-b px-3 py-2.5">
          <Text className="text-foreground text-sm font-extrabold">Messenger</Text>
          <View className="flex-row items-center gap-1.5">
            <Button variant="ghost" size="icon" onPress={() => navigation.navigate("Tags")} className="bg-muted h-8 w-8 rounded-lg">
              <Icon as={TagsIcon} className="text-foreground" size={16} />
            </Button>
            <Button variant="ghost" size="icon" onPress={() => navigation.navigate("Statuses")} className="bg-muted h-8 w-8 rounded-lg">
              <Icon as={StatusesIcon} className="text-foreground" size={16} />
            </Button>
            <Button variant="ghost" size="icon" onPress={() => navigation.navigate("Templates")} className="bg-muted h-8 w-8 rounded-lg">
              <Icon as={TemplatesIcon} className="text-foreground" size={16} />
            </Button>
            <Button variant="ghost" size="icon" onPress={() => navigation.navigate("Settings")} className="bg-muted h-8 w-8 rounded-lg">
              <Icon as={SettingsIcon} className="text-foreground" size={16} />
            </Button>
            <Button variant="ghost" size="icon" onPress={() => void auth.logout()} className="bg-muted h-8 w-8 rounded-lg">
              <Icon as={LogOutIcon} className="text-foreground" size={16} />
            </Button>
          </View>
        </View>

        <InboxDashboard />

        <View className="border-border border-b px-3 py-2">
          <View className="flex-row flex-wrap gap-2">
            {tabs.map((t) => {
              const active = activeTab === t.value
              return (
                <Button
                  variant="ghost"
                  key={t.value}
                  onPress={() => setActiveTab(t.value)}
                  className={cn(
                    "h-auto rounded-xl border px-3 py-2",
                    active ? "bg-muted/60 border-foreground/20" : "bg-muted/30 border-transparent",
                  )}
                >
                  <Text className={cn("text-xs font-bold", active ? "text-foreground" : "text-muted-foreground")}>
                    {t.label}
                    {t.value === "unread" && totalUnread > 0 ? ` ${totalUnread}` : ""}
                    {t.value === "snoozed" && snoozedCount > 0 ? ` (${snoozedCount})` : ""}
                  </Text>
                </Button>
              )
            })}
          </View>
        </View>

        <View className="border-border border-b px-3 pt-2.5 pb-2">
          <Button
            variant="ghost"
            onPress={() => setSearchOpen(true)}
            className="bg-muted active:bg-muted/70 h-auto flex-row items-center justify-start gap-2 rounded-xl px-3 py-3"
          >
            <Icon as={SearchIcon} className="text-muted-foreground" size={18} />
            <Text className="text-muted-foreground font-semibold">Пошук діалогів...</Text>
          </Button>
        </View>

        {bootstrapError ? (
          <View className="bg-destructive/10 px-3 py-2">
            <Text className="text-destructive font-semibold" numberOfLines={2}>
              {bootstrapError}
            </Text>
          </View>
        ) : null}

        <SectionList
          sections={sections as any}
          keyExtractor={(item: Conversation) => item.id}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          renderSectionHeader={({ section }: any) =>
            section.title ? (
              <Text className="text-muted-foreground pt-3 pb-2 text-[10px] font-black uppercase">{section.title}</Text>
            ) : null
          }
          renderItem={({ item }: { item: Conversation }) => {
            const status = item.statusId ? statusesById.get(item.statusId) ?? null : null
            const convTags = item.tagIds
              .slice(0, 4)
              .map((id) => tagsById.get(id))
              .filter((x): x is Tag => Boolean(x))

            return (
              <SwipeRow
                leftLabel={item.isPinned ? "Відкріпити" : "Закріпити"}
                rightLabel={item.isArchived ? "Відновити" : "Архів"}
                onSwipeRight={() => {
                  if (activeTab !== "all") {
                    Alert.alert("Закріплення", "Закріплення працює тільки у вкладці «Усі».")
                    return
                  }
                  if (item.isPinned) unpinConversation(item.id)
                  else pinConversation(item.id)
                }}
                onSwipeLeft={() => {
                  if (item.isArchived) {
                    unarchiveConversation(item.id)
                    return
                  }
                  if (item.isPinned) {
                    Alert.alert("Діалог закріплено", "Відкріпити та архівувати?", [
                      { text: "Скасувати", style: "cancel" },
                      { text: "Так", style: "destructive", onPress: () => archiveConversation(item.id, true) },
                    ])
                    return
                  }
                  archiveConversation(item.id)
                }}
              >
                <ConversationRow
                  conversation={item}
                  status={status}
                  tags={convTags}
                  onPress={() => {
                    selectConversation(item.id)
                    navigation.navigate("Chat", { conversationId: item.id, title: item.buyerName })
                  }}
                />
              </SwipeRow>
            )
          }}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 96 }}
          ListEmptyComponent={
            !bootstrapping ? (
              <View className="items-center justify-center gap-1.5 py-12">
                <Text className="text-foreground text-sm font-black">
                  {activeTab === "archive"
                    ? "Архів порожній"
                    : activeTab === "snoozed"
                      ? "Немає відкладених"
                      : activeTab === "unread"
                        ? "Все прочитано!"
                        : "Немає діалогів"}
                </Text>
                <Text className="text-muted-foreground text-center" style={{ maxWidth: 300 }}>
                  {activeTab === "archive"
                    ? "Архівовані діалоги зʼявляться тут"
                    : activeTab === "snoozed"
                      ? "Відкладені діалоги зʼявляться тут після snooze"
                      : activeTab === "unread"
                        ? "Немає непрочитаних повідомлень"
                        : "Підключіть канал для початку роботи"}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={<Text className="text-muted-foreground py-3 text-center text-[10px]">Останнє оновлення: щойно</Text>}
        />

        <Button
          size="icon"
          onPress={() => setSearchOpen(true)}
          className="bg-primary absolute bottom-4 right-4 h-14 w-14 rounded-full"
          style={FAB_SHADOW}
        >
          <Icon as={PlusIcon} className="text-primary-foreground" size={22} />
        </Button>

        <SearchModal
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          onOpenConversation={(conversationId) => {
            selectConversation(conversationId)
            navigation.navigate("Chat", { conversationId })
          }}
          onOpenMessage={(conversationId, messageId) => {
            jumpToMessage(conversationId, messageId)
            navigation.navigate("Chat", { conversationId })
          }}
        />

        {bootstrapping ? (
          <View className="absolute inset-0 items-center justify-center bg-background/60" pointerEvents="none">
            <ActivityIndicator />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  )
}
