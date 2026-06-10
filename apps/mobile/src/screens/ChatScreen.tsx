import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import * as DocumentPicker from "expo-document-picker"
import {
  Archive as ArchiveIcon,
  ArrowLeft,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Paperclip,
  Pin,
  Send,
  Tag as TagIcon,
  User,
  X,
  Zap,
} from "lucide-react-native"

import { Button, Checkbox, Icon, Input, Text } from "@/components/ui"
import { cn } from "@/registry/nativewind/lib/utils"
import { ModalSheet } from "@/components/ModalSheet"

import { formatDateDivider, formatFullTime, formatSnoozedUntil, hsl } from "../lib/date-utils"
import type { RootStackParamList } from "../navigation/types"
import { useAppStore } from "../store"
import type { Message, PaymentStatus, ShippingStatus, Status, Tag, Template } from "../types"

type Props = NativeStackScreenProps<RootStackParamList, "Chat">

const EMPTY_MESSAGES: Message[] = []

type ChatItem =
  | { type: "date"; id: string; label: string }
  | { type: "message"; id: string; message: Message }

const PICK_ROW_BASE =
  "active:bg-muted/40 h-auto flex-row items-center justify-start gap-3 rounded-xl bg-muted/30 px-3 py-3"

function MessageStatusIcon({ status }: { status: Message["status"] }) {
  const base = "text-[10px] font-black"
  switch (status) {
    case "sending":
      return <Text className={cn(base, "text-white/70")}>🕒</Text>
    case "sent":
      return <Text className={cn(base, "text-white/70")}>✓</Text>
    case "delivered":
      return <Text className={cn(base, "text-white/70")}>✓✓</Text>
    case "read":
      return <Text className={cn(base, "text-blue-600")}>✓✓</Text>
    case "error":
      return <Text className={cn(base, "text-destructive")}>⚠️</Text>
    default:
      return null
  }
}

function MessageBubble({ message, onReply }: { message: Message; onReply: (m: Message) => void }) {
  const isOut = message.direction === "out"
  const createAttachmentShortLink = useAppStore((s) => s.createAttachmentShortLink)

  return (
    <Button
      variant="ghost"
      onLongPress={() => onReply(message)}
      className={cn(
        "active:bg-transparent active:opacity-95 h-auto flex-row rounded-none bg-transparent px-0 py-0",
        isOut ? "justify-end" : "justify-start",
      )}
    >
      <View
        className={cn("rounded-2xl px-3 py-2", isOut ? "bg-primary" : "bg-muted")}
        style={[
          { maxWidth: "78%" },
          isOut ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 },
        ]}
      >
        {message.replyTo ? (
          <View className={cn("mb-1 border-l-2 pl-2", isOut ? "border-white/50" : "border-blue-600")}>
            <Text numberOfLines={1} className="text-muted-foreground text-xs font-semibold">
              {message.replyTo}
            </Text>
          </View>
        ) : null}

        {message.attachments && message.attachments.length > 0 ? (
          <View className="mb-2 gap-2">
            {message.attachments.map((att) => (
              <Button
                variant="secondary"
                key={att.id}
                onPress={() => {
                  void (async () => {
                    try {
                      const url = await createAttachmentShortLink(att.id)
                      await Linking.openURL(url)
                    } catch (e: unknown) {
                      Alert.alert("Не вдалося відкрити файл", e instanceof Error ? e.message : String(e))
                    }
                  })()
                }}
                className={cn(
                  "active:opacity-95 h-auto flex-row items-center justify-start gap-2 rounded-xl border px-3 py-2",
                  isOut ? "bg-white/10 border-white/20" : "bg-background/60 border-border",
                )}
              >
                <Text className="w-6 text-center">
                  {att.type === "image" ? "🖼️" : att.type === "video" ? "🎬" : "📎"}
                </Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    className={cn("text-xs font-black", isOut ? "text-primary-foreground" : "text-foreground")}
                  >
                    {att.name}
                  </Text>
                  <Text className={cn("text-[10px] font-semibold", isOut ? "text-white/70" : "text-muted-foreground")}>
                    Відкрити (коротке посилання на 7 днів)
                  </Text>
                </View>
              </Button>
            ))}
          </View>
        ) : null}

        {message.text.length > 0 ? (
          <Text className={cn("text-sm leading-5", isOut ? "text-primary-foreground" : "text-foreground")}>
            {message.text}
          </Text>
        ) : null}

        <View className={cn("mt-1.5 flex-row items-center gap-1.5", isOut ? "justify-end" : "justify-start")}>
          <Text className={cn("text-[10px] font-semibold", isOut ? "text-white/70" : "text-muted-foreground")}>
            {formatFullTime(message.timestamp)}
          </Text>
          {isOut ? <MessageStatusIcon status={message.status} /> : null}
        </View>
      </View>
    </Button>
  )
}

function StatusPicker({
  open,
  onClose,
  statuses,
  currentStatusId,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  statuses: Status[]
  currentStatusId?: string
  onSelect: (statusId: string | null) => void
}) {
  return (
    <ModalSheet open={open} onClose={onClose} title="Статус">
      <Button
        variant="secondary"
        onPress={() => {
          onSelect(null)
          onClose()
        }}
        className={PICK_ROW_BASE}
      >
        <View className="w-8 items-center">
          <Text className="text-muted-foreground font-black">—</Text>
        </View>
        <Text className="text-foreground flex-1 font-extrabold">Без статусу</Text>
      </Button>

      {statuses.map((s) => (
        <Button
          variant="secondary"
          key={s.id}
          onPress={() => {
            onSelect(s.id)
            onClose()
          }}
          className={cn(PICK_ROW_BASE, currentStatusId === s.id && "bg-muted/60")}
        >
          <View className="w-8 items-center">
            <Text>{s.icon}</Text>
          </View>
          <Text className="text-foreground flex-1 font-extrabold">{s.name}</Text>
          <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hsl(s.color) }} />
        </Button>
      ))}
    </ModalSheet>
  )
}

function TagPicker({
  open,
  onClose,
  tags,
  currentTagIds,
  onToggle,
}: {
  open: boolean
  onClose: () => void
  tags: Tag[]
  currentTagIds: string[]
  onToggle: (tagId: string, nextChecked: boolean) => void
}) {
  return (
    <ModalSheet open={open} onClose={onClose} title="Теги">
      {tags.map((t) => {
        const checked = currentTagIds.includes(t.id)
        return (
          <Button
            variant="secondary"
            key={t.id}
            onPress={() => onToggle(t.id, !checked)}
            className={PICK_ROW_BASE}
          >
            <View pointerEvents="none" className="w-8 items-center">
              <Checkbox checked={checked} onCheckedChange={() => {}} />
            </View>
            <View className="w-8 items-center">
              <Text>{t.icon}</Text>
            </View>
            <Text className="text-foreground flex-1 font-extrabold">{t.name}</Text>
            <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hsl(t.color) }} />
          </Button>
        )
      })}
    </ModalSheet>
  )
}

function SnoozePicker({
  open,
  onClose,
  onSnooze,
}: {
  open: boolean
  onClose: () => void
  onSnooze: (untilIso: string) => void
}) {
  const now = new Date()
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000)
  const today20 = new Date(now)
  today20.setHours(20, 0, 0, 0)
  const tomorrow9 = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  tomorrow9.setHours(9, 0, 0, 0)

  const options = [
    { label: `Через 1 годину — ${formatFullTime(inOneHour.toISOString())}`, until: inOneHour.toISOString() },
    { label: "Сьогодні ввечері — 20:00", until: today20.toISOString() },
    { label: "Завтра зранку — 09:00", until: tomorrow9.toISOString() },
  ]

  return (
    <ModalSheet open={open} onClose={onClose} title="Snooze">
      <Text className="text-muted-foreground text-xs">
        Push-сповіщення вимкнені поки діалог snoozed
      </Text>
      {options.map((opt) => (
        <Button
          variant="secondary"
          key={opt.until}
          onPress={() => {
            onSnooze(opt.until)
            onClose()
          }}
          className={PICK_ROW_BASE}
        >
          <View className="w-8 items-center">
            <Icon as={Clock} className="text-foreground" size={16} />
          </View>
          <Text className="text-foreground flex-1 font-extrabold">{opt.label}</Text>
        </Button>
      ))}
    </ModalSheet>
  )
}

function TemplatesPicker({
  open,
  onClose,
  templates,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  templates: Template[]
  onSelect: (text: string) => void
}) {
  return (
    <ModalSheet open={open} onClose={onClose} title="Шаблони">
      {templates.length === 0 ? <Text className="text-muted-foreground text-xs">Немає шаблонів</Text> : null}
      {templates.map((t) => (
        <Button
          variant="secondary"
          key={t.id}
          onPress={() => {
            onSelect(t.text)
            onClose()
          }}
          className={PICK_ROW_BASE}
        >
          <View className="w-8 items-center">
            <Icon as={FileText} className="text-foreground" size={16} />
          </View>
          <Text className="text-foreground flex-1 font-extrabold" numberOfLines={2}>
            {t.title}
          </Text>
        </Button>
      ))}
    </ModalSheet>
  )
}

function ShortcutsPicker({
  open,
  onClose,
  shortcuts,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  shortcuts: { id: string; label: string; text: string; icon: string }[]
  onSelect: (text: string) => void
}) {
  return (
    <ModalSheet open={open} onClose={onClose} title="Швидкі вставки">
      {shortcuts.map((s) => (
        <Button
          variant="secondary"
          key={s.id}
          onPress={() => {
            onSelect(s.text)
            onClose()
          }}
          className={PICK_ROW_BASE}
        >
          <View className="w-8 items-center">
            <Text>{s.icon}</Text>
          </View>
          <Text className="text-foreground flex-1 font-extrabold">{s.label}</Text>
        </Button>
      ))}
    </ModalSheet>
  )
}

export function ChatScreen({ navigation, route }: Props) {
  const conversationId = route.params.conversationId

  const selectConversation = useAppStore((s) => s.selectConversation)
  const markAsRead = useAppStore((s) => s.markAsRead)
  const sendMessage = useAppStore((s) => s.sendMessage)
  const sendAttachment = useAppStore((s) => s.sendAttachment)
  const pinConversation = useAppStore((s) => s.pinConversation)
  const unpinConversation = useAppStore((s) => s.unpinConversation)
  const archiveConversation = useAppStore((s) => s.archiveConversation)
  const unarchiveConversation = useAppStore((s) => s.unarchiveConversation)
  const snoozeConversation = useAppStore((s) => s.snoozeConversation)
  const unsnoozeConversation = useAppStore((s) => s.unsnoozeConversation)
  const setConversationStatus = useAppStore((s) => s.setConversationStatus)
  const setConversationTags = useAppStore((s) => s.setConversationTags)
  const setSellerNote = useAppStore((s) => s.setSellerNote)
  const setTtn = useAppStore((s) => s.setTtn)
  const setPaymentStatus = useAppStore((s) => s.setPaymentStatus)
  const setShippingStatus = useAppStore((s) => s.setShippingStatus)
  const setFollowUp = useAppStore((s) => s.setFollowUp)

  const conversation = useAppStore((s) => s.conversations.find((c) => c.id === conversationId) ?? null)
  const messages = useAppStore((s) => s.messages[conversationId] ?? EMPTY_MESSAGES)
  const statuses = useAppStore((s) => s.statuses)
  const tags = useAppStore((s) => s.tags)
  const templatesAll = useAppStore((s) => s.templates)
  const shortcuts = useAppStore((s) => s.shortcuts)

  const [text, setText] = useState("")
  const [replyTo, setReplyTo] = useState<Message | null>(null)

  const [showActions, setShowActions] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [showTags, setShowTags] = useState(false)
  const [showSnooze, setShowSnooze] = useState(false)
  const [showBuyer, setShowBuyer] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)

  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [editingTtn, setEditingTtn] = useState(false)
  const [ttnText, setTtnText] = useState("")

  const listRef = useRef<FlatList<ChatItem>>(null)

  useEffect(() => {
    selectConversation(conversationId)
    markAsRead(conversationId)
  }, [conversationId, markAsRead, selectConversation])

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
    return () => clearTimeout(t)
  }, [messages.length])

  useEffect(() => {
    if (!showBuyer || !conversation) return
    setEditingNote(false)
    setEditingTtn(false)
    setNoteText(conversation.sellerNote ?? "")
    setTtnText(conversation.ttn ?? "")
  }, [conversation, showBuyer])

  const items: ChatItem[] = useMemo(() => {
    const out: ChatItem[] = []
    let lastDateKey: string | null = null
    for (const m of messages) {
      const d = new Date(m.timestamp)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (key !== lastDateKey) {
        lastDateKey = key
        out.push({ type: "date", id: `d_${key}`, label: formatDateDivider(m.timestamp) })
      }
      out.push({ type: "message", id: m.id, message: m })
    }
    return out
  }, [messages])

  const templates = useMemo(() => {
    if (!conversation) return templatesAll
    return templatesAll.filter((t) => t.scope === "global" || t.scope === conversation.channelType)
  }, [conversation, templatesAll])

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed) return
    sendMessage(conversationId, trimmed, replyTo?.text)
    setText("")
    setReplyTo(null)
  }

  function handlePickAttachment() {
    void (async () => {
      try {
        const res: any = await DocumentPicker.getDocumentAsync({
          multiple: false,
          copyToCacheDirectory: true,
        })

        const canceled = res?.canceled === true || res?.type === "cancel"
        if (canceled) return

        const asset = (Array.isArray(res?.assets) && res.assets.length > 0 ? res.assets[0] : res) as any
        const uri = typeof asset?.uri === "string" ? asset.uri : null
        if (!uri) throw new Error("No uri from document picker")

        const name = typeof asset?.name === "string" && asset.name.length > 0 ? asset.name : "file"
        const mimeType = typeof asset?.mimeType === "string" && asset.mimeType.length > 0 ? asset.mimeType : undefined
        const sizeBytes = typeof asset?.size === "number" ? asset.size : undefined

        sendAttachment(conversationId, {
          uri,
          name,
          ...(mimeType ? { mimeType } : {}),
          ...(typeof sizeBytes === "number" ? { sizeBytes } : {}),
        })
      } catch (e: unknown) {
        Alert.alert("Помилка", e instanceof Error ? e.message : String(e))
      }
    })()
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View className="bg-background flex-1">
        <View className="border-border flex-row items-center gap-2 border-b px-3 py-2.5">
          <Button variant="ghost" size="icon" onPress={() => navigation.goBack()} className="bg-muted h-9 w-9 rounded-xl">
            <Icon as={ArrowLeft} className="text-foreground" size={18} />
          </Button>

          <Button
            variant="ghost"
            onPress={() => setShowBuyer(true)}
            className="h-auto flex-1 flex-col items-start justify-center gap-0 rounded-none bg-transparent px-0 py-0 active:bg-transparent"
          >
            <View className="flex-row items-center gap-1.5">
              {conversation?.isOnline ? <View className="h-2 w-2 rounded-full bg-green-600" /> : null}
              <Text className="text-foreground flex-shrink text-sm font-black" numberOfLines={1}>
                {conversation?.buyerName ?? "Діалог"}
              </Text>
              {conversation?.buyerHistory?.isRepeatBuyer ? (
                <View className="bg-orange-500/15 rounded-full px-2 py-0.5">
                  <Text className="text-orange-600 text-[9px] font-black">⭐ VIP</Text>
                </View>
              ) : null}
            </View>
            <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
              {(conversation?.channelType === "olx" ? "OLX" : "Prom") + " • " + (conversation?.accountAlias ?? "—")}
            </Text>
          </Button>

          <Button variant="ghost" size="icon" onPress={() => setShowBuyer(true)} className="bg-muted h-9 w-9 rounded-xl">
            <Icon as={User} className="text-foreground" size={18} />
          </Button>
          <Button variant="ghost" size="icon" onPress={() => setShowActions(true)} className="bg-muted h-9 w-9 rounded-xl">
            <Icon as={MoreHorizontal} className="text-foreground" size={18} />
          </Button>
        </View>

        {conversation?.contextTitle ? (
          <Button
            variant="ghost"
            onPress={() => navigation.navigate("Context", { conversationId })}
            className="bg-muted/30 border-border h-auto flex-row items-center justify-start gap-3 rounded-none border-b px-3 py-2.5"
          >
            <View className="bg-muted h-9 w-9 rounded-xl" />
            <View className="flex-1 gap-0.5">
              <Text className="text-foreground text-xs font-extrabold" numberOfLines={1}>
                {conversation.contextTitle}
              </Text>
              {conversation.contextPrice != null ? (
                <Text className="text-muted-foreground text-xs">
                  {conversation.contextPrice} {conversation.contextCurrency ?? ""}
                </Text>
              ) : null}
            </View>
          </Button>
        ) : null}

        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(i) => i.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 6 }}
          renderItem={({ item }) => {
            if (item.type === "date") {
              return (
                <View className="items-center py-2.5">
                  <Text className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-[11px] font-extrabold">
                    {item.label}
                  </Text>
                </View>
              )
            }
            return <MessageBubble message={item.message} onReply={(m) => setReplyTo(m)} />
          }}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
        >
          {replyTo ? (
            <View className="border-border flex-row items-center gap-3 border-t bg-muted/30 px-3 py-2.5">
              <View className="h-7 w-1 rounded-full bg-blue-600" />
              <View style={{ flex: 1 }}>
                <Text className="text-blue-600 text-[10px] font-black">Відповідь</Text>
                <Text numberOfLines={1} className="text-muted-foreground text-xs font-semibold">
                  {replyTo.text}
                </Text>
              </View>
              <Button variant="ghost" size="icon" onPress={() => setReplyTo(null)} className="bg-muted h-8 w-8 rounded-xl">
                <Icon as={X} className="text-foreground" size={16} />
              </Button>
            </View>
          ) : null}

          <View className="border-border flex-row items-end gap-2 border-t px-3 py-2.5">
            <Button variant="ghost" size="icon" onPress={handlePickAttachment} className="bg-muted h-9 w-9 rounded-xl">
              <Icon as={Paperclip} className="text-foreground" size={18} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onPress={() => setShowTemplates(true)}
              className="bg-muted h-9 w-9 rounded-xl"
            >
              <Icon as={FileText} className="text-foreground" size={18} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onPress={() => setShowShortcuts(true)}
              className="bg-muted h-9 w-9 rounded-xl"
            >
              <Icon as={Zap} className="text-foreground" size={18} />
            </Button>

            <Input
              value={text}
              onChangeText={setText}
              placeholder="Напишіть повідомлення..."
              multiline
              textAlignVertical="top"
              className="bg-muted flex-1 h-auto rounded-xl border-0 px-3 py-2"
              style={{ minHeight: 38, maxHeight: 120 }}
            />

            <Button size="icon" disabled={text.trim().length === 0} onPress={handleSend} className="h-10 w-10 rounded-xl">
              <Icon as={Send} className="text-primary-foreground" size={18} />
            </Button>
          </View>
        </KeyboardAvoidingView>

        <ModalSheet open={showActions} onClose={() => setShowActions(false)} title="Дії">
          <Button
            variant="secondary"
            onPress={() => {
              if (!conversation) return
              if (conversation.isPinned) unpinConversation(conversationId)
              else pinConversation(conversationId)
              setShowActions(false)
            }}
            className={PICK_ROW_BASE}
          >
            <View className="w-8 items-center">
              <Icon as={Pin} className="text-foreground" size={16} />
            </View>
            <Text className="text-foreground flex-1 font-extrabold">{conversation?.isPinned ? "Відкріпити" : "Закріпити"}</Text>
          </Button>

          <Button
            variant="secondary"
            onPress={() => {
              if (!conversation) return
              if (conversation.isSnoozed) {
                unsnoozeConversation(conversationId)
                setShowActions(false)
              } else {
                setShowActions(false)
                setShowSnooze(true)
              }
            }}
            className={PICK_ROW_BASE}
          >
            <View className="w-8 items-center">
              <Icon as={Clock} className="text-foreground" size={16} />
            </View>
            <Text className="text-foreground flex-1 font-extrabold">{conversation?.isSnoozed ? "Зняти snooze" : "Snooze"}</Text>
          </Button>

          <Button
            variant="secondary"
            onPress={() => {
              setShowActions(false)
              setShowStatus(true)
            }}
            className={PICK_ROW_BASE}
          >
            <View className="w-8 items-center">
              <Icon as={CheckCircle2} className="text-foreground" size={16} />
            </View>
            <Text className="text-foreground flex-1 font-extrabold">Статус</Text>
          </Button>

          <Button
            variant="secondary"
            onPress={() => {
              setShowActions(false)
              setShowTags(true)
            }}
            className={PICK_ROW_BASE}
          >
            <View className="w-8 items-center">
              <Icon as={TagIcon} className="text-foreground" size={16} />
            </View>
            <Text className="text-foreground flex-1 font-extrabold">Теги</Text>
          </Button>

          <Button
            variant="secondary"
            onPress={() => {
              if (!conversation) return
              if (conversation.isArchived) {
                unarchiveConversation(conversationId)
                setShowActions(false)
                return
              }
              if (!conversation.isPinned) {
                archiveConversation(conversationId)
                setShowActions(false)
                return
              }
              Alert.alert("Діалог закріплено", "Відкріпити та архівувати?", [
                { text: "Скасувати", style: "cancel" },
                {
                  text: "Так",
                  style: "destructive",
                  onPress: () => {
                    archiveConversation(conversationId, true)
                    setShowActions(false)
                  },
                },
              ])
            }}
            className={PICK_ROW_BASE}
          >
            <View className="w-8 items-center">
              <Icon as={ArchiveIcon} className="text-foreground" size={16} />
            </View>
            <Text className="text-foreground flex-1 font-extrabold">{conversation?.isArchived ? "Розархівувати" : "Архівувати"}</Text>
          </Button>

          {conversation?.snoozedUntil ? (
            <Text className="text-muted-foreground text-xs">Snoozed до: {formatSnoozedUntil(conversation.snoozedUntil)}</Text>
          ) : null}
        </ModalSheet>

        <StatusPicker
          open={showStatus}
          onClose={() => setShowStatus(false)}
          statuses={statuses}
          onSelect={(statusId) => setConversationStatus(conversationId, statusId)}
          {...(conversation?.statusId ? { currentStatusId: conversation.statusId } : {})}
        />

        <TagPicker
          open={showTags}
          onClose={() => setShowTags(false)}
          tags={tags}
          currentTagIds={Array.isArray(conversation?.tagIds) ? conversation.tagIds : []}
          onToggle={(tagId, nextChecked) => {
            const prev = conversation?.tagIds ?? []
            const next = nextChecked ? Array.from(new Set([...prev, tagId])) : prev.filter((x) => x !== tagId)
            setConversationTags(conversationId, next)
          }}
        />

        <SnoozePicker open={showSnooze} onClose={() => setShowSnooze(false)} onSnooze={(until) => snoozeConversation(conversationId, until)} />

        <TemplatesPicker
          open={showTemplates}
          onClose={() => setShowTemplates(false)}
          templates={templates}
          onSelect={(tplText) => setText((prev) => (prev ? prev + "\n" + tplText : tplText))}
        />

        <ShortcutsPicker
          open={showShortcuts}
          onClose={() => setShowShortcuts(false)}
          shortcuts={shortcuts}
          onSelect={(insert) => setText((prev) => (prev ? prev + "\n" + insert : insert))}
        />

        <ModalSheet open={showBuyer} onClose={() => setShowBuyer(false)} title="Покупець">
          {conversation ? (
            <>
              <View className="gap-1 py-2">
                <Text className="text-foreground text-base font-black">{conversation.buyerName}</Text>
                {conversation.buyerPhone ? <Text className="text-muted-foreground">{conversation.buyerPhone}</Text> : null}
                <Text className="text-muted-foreground">
                  {(conversation.channelType === "olx" ? "OLX" : "Prom") + " • " + (conversation.accountAlias ?? "—")}
                </Text>
              </View>

              {conversation.contextExternalUrl ? (
                <Button
                  onPress={() => void Linking.openURL(conversation.contextExternalUrl!)}
                  className="h-auto flex-row items-center justify-center gap-2 rounded-xl px-3 py-3"
                >
                  <Icon as={ExternalLink} className="text-primary-foreground" size={16} />
                  <Text className="text-primary-foreground font-black">Відкрити зовнішній контекст</Text>
                </Button>
              ) : null}

              <View className="mt-3 flex-row gap-2">
                <View className="flex-1 gap-2">
                  <Text className="text-foreground text-xs font-black">Нотатка продавця</Text>
                  {editingNote ? (
                    <>
                      <Input
                        value={noteText}
                        onChangeText={setNoteText}
                        placeholder="Внутрішня нотатка..."
                        multiline
                        textAlignVertical="top"
                        className="bg-muted border-border h-auto rounded-xl"
                        style={{ minHeight: 84 }}
                      />
                      <View className="flex-row gap-2">
                        <Button
                          onPress={() => {
                            setSellerNote(conversationId, noteText)
                            setEditingNote(false)
                          }}
                          className="flex-1 h-10 rounded-xl"
                        >
                          <View className="flex-row items-center justify-center gap-2">
                            <Icon as={Check} className="text-primary-foreground" size={16} />
                            <Text className="text-primary-foreground font-black">Зберегти</Text>
                          </View>
                        </Button>
                        <Button
                          variant="secondary"
                          onPress={() => {
                            setNoteText(conversation.sellerNote ?? "")
                            setEditingNote(false)
                          }}
                          className="flex-1 h-10 rounded-xl"
                        >
                          <View className="flex-row items-center justify-center gap-2">
                            <Icon as={X} className="text-secondary-foreground" size={16} />
                            <Text className="text-secondary-foreground font-black">Скасувати</Text>
                          </View>
                        </Button>
                      </View>
                    </>
                  ) : conversation.sellerNote ? (
                    <Button
                      variant="secondary"
                      onPress={() => setEditingNote(true)}
                      className="h-auto justify-start rounded-xl border border-border bg-muted/30 px-3 py-3"
                    >
                      <Text className="text-foreground font-semibold">{conversation.sellerNote}</Text>
                    </Button>
                  ) : (
                    <Button variant="outline" onPress={() => setEditingNote(true)} className="h-auto rounded-xl px-3 py-3">
                      <Text className="text-foreground font-black">+ Додати нотатку</Text>
                    </Button>
                  )}
                </View>

                <View className="flex-1 gap-2">
                  <Text className="text-foreground text-xs font-black">ТТН</Text>
                  {editingTtn ? (
                    <>
                      <Input
                        value={ttnText}
                        onChangeText={setTtnText}
                        placeholder="20450000..."
                        className="bg-muted border-border rounded-xl"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <View className="flex-row gap-2">
                        <Button
                          onPress={() => {
                            if (ttnText.trim().length === 0) return
                            setTtn(conversationId, ttnText.trim())
                            setEditingTtn(false)
                          }}
                          className="flex-1 h-10 rounded-xl"
                        >
                          <View className="flex-row items-center justify-center gap-2">
                            <Icon as={Check} className="text-primary-foreground" size={16} />
                            <Text className="text-primary-foreground font-black">Зберегти</Text>
                          </View>
                        </Button>
                        <Button
                          variant="secondary"
                          onPress={() => {
                            setTtnText(conversation.ttn ?? "")
                            setEditingTtn(false)
                          }}
                          className="flex-1 h-10 rounded-xl"
                        >
                          <View className="flex-row items-center justify-center gap-2">
                            <Icon as={X} className="text-secondary-foreground" size={16} />
                            <Text className="text-secondary-foreground font-black">Скасувати</Text>
                          </View>
                        </Button>
                      </View>
                    </>
                  ) : conversation.ttn ? (
                    <Button
                      variant="secondary"
                      onPress={() => setEditingTtn(true)}
                      className="h-auto justify-start rounded-xl border border-border bg-muted/30 px-3 py-3"
                    >
                      <Text className="text-foreground font-semibold">{conversation.ttn}</Text>
                    </Button>
                  ) : (
                    <Button variant="outline" onPress={() => setEditingTtn(true)} className="h-auto rounded-xl px-3 py-3">
                      <Text className="text-foreground font-black">+ Додати ТТН</Text>
                    </Button>
                  )}
                </View>
              </View>

              <Text className="text-foreground mt-3 text-xs font-black">Оплата</Text>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {(["pending", "paid", "partial", "refunded"] as PaymentStatus[]).map((st) => {
                  const active = conversation.paymentStatus === st
                  const label =
                    st === "pending" ? "Очікує" : st === "paid" ? "Оплачено" : st === "partial" ? "Частково" : "Повернення"
                  return (
                    <Button
                      variant="ghost"
                      key={st}
                      onPress={() => setPaymentStatus(conversationId, st)}
                      className={cn(
                        "h-auto rounded-xl border px-3 py-2",
                        active ? "bg-primary border-primary" : "bg-background border-border",
                      )}
                    >
                      <Text className={cn("text-xs font-extrabold", active ? "text-primary-foreground" : "text-foreground")}>
                        {label}
                      </Text>
                    </Button>
                  )
                })}
              </View>

              <Text className="text-foreground mt-3 text-xs font-black">Доставка</Text>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {(["not_shipped", "shipped", "delivered", "returned"] as ShippingStatus[]).map((st) => {
                  const active = conversation.shippingStatus === st
                  const label =
                    st === "not_shipped"
                      ? "Не відправлено"
                      : st === "shipped"
                        ? "Відправлено"
                        : st === "delivered"
                          ? "Доставлено"
                          : "Повернення"
                  return (
                    <Button
                      variant="ghost"
                      key={st}
                      onPress={() => setShippingStatus(conversationId, st)}
                      className={cn(
                        "h-auto rounded-xl border px-3 py-2",
                        active ? "bg-primary border-primary" : "bg-background border-border",
                      )}
                    >
                      <Text className={cn("text-xs font-extrabold", active ? "text-primary-foreground" : "text-foreground")}>
                        {label}
                      </Text>
                    </Button>
                  )
                })}
              </View>

              <Text className="text-foreground mt-3 text-xs font-black">Нагадування</Text>
              {conversation.followUpAt ? (
                <View className="bg-muted/30 border-border mt-2 flex-row items-center gap-2 rounded-xl border px-3 py-3">
                  <View style={{ flex: 1 }}>
                    <Text className="text-foreground font-black">{formatFullTime(conversation.followUpAt)}</Text>
                    <Text className="text-muted-foreground text-xs">Нагадування встановлено</Text>
                  </View>
                  <Button variant="ghost" size="icon" onPress={() => setFollowUp(conversationId, undefined)} className="bg-muted h-9 w-9 rounded-xl">
                    <Icon as={X} className="text-foreground" size={16} />
                  </Button>
                </View>
              ) : (
                <Button
                  onPress={() => {
                    const t = new Date()
                    t.setDate(t.getDate() + 1)
                    t.setHours(10, 0, 0, 0)
                    setFollowUp(conversationId, t.toISOString())
                  }}
                  className="mt-2 h-auto flex-row items-center justify-center gap-2 rounded-xl px-3 py-3"
                >
                  <Icon as={Bell} className="text-primary-foreground" size={16} />
                  <Text className="text-primary-foreground font-black">Нагадати завтра о 10:00</Text>
                </Button>
              )}
            </>
          ) : (
            <Text className="text-muted-foreground text-xs">Завантаження...</Text>
          )}
        </ModalSheet>
      </View>
    </SafeAreaView>
  )
}

