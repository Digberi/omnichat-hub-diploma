"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { Activity, Command, FileText, Plus, Settings, Tag } from "lucide-react"

import { CommandPalette } from "@/components/CommandPalette"
import { BuyerSidebar } from "@/components/chat/BuyerSidebar"
import { ConversationList } from "@/components/inbox/ConversationList"
import { InboxDashboard } from "@/components/inbox/InboxDashboard"
import { InboxTab, InboxTabs } from "@/components/inbox/InboxTabs"
import { StatusManagerModal } from "@/components/management/StatusManagerModal"
import { TagManagerModal } from "@/components/management/TagManagerModal"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { getAccessToken } from "@/lib/tokens"
import { logout } from "@/lib/logout"
import { useAppStore } from "@/store"

const CONVERSATION_PATH_RE = /^\/inbox\/([^/]+)\/?$/

/**
 * The inbox shell. The whole point of having this as a layout (rather than a
 * single page) is that Next.js does NOT remount layouts when only the child
 * route changes — so the sidebar (search, tabs, filtered list, dashboard
 * metrics) keeps its render state when the user clicks between conversations.
 *
 * The previous implementation lived in a `[[...conversationId]]` page and
 * synchronized URL ↔ Zustand with two competing effects, which caused an
 * infinite redirect loop on prod (`router.replace` in one effect re-triggered
 * the other on the next render). With routing in charge:
 *   - `/inbox` renders the EmptyChatState child page
 *   - `/inbox/<id>` renders the chat child page for that id
 *   - the sidebar reads `usePathname()` once per URL change and mirrors the
 *     id into the store so other components (CommandPalette, ConversationRow
 *     highlight) keep working without a second loop
 *
 * There is intentionally no store → URL effect; navigation goes through
 * `router.push` / `router.replace` directly from the row click handlers and
 * keyboard shortcuts.
 */
const InboxLayoutInner = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [showTagManager, setShowTagManager] = useState(false)
  const [showStatusManager, setShowStatusManager] = useState(false)

  const {
    conversations,
    selectedConversationId,
    selectConversation,
    showBuyerSidebar,
    activeInboxTab,
    setActiveInboxTab,
  } = useAppStore()
  const activeTab: InboxTab = activeInboxTab
  const setActiveTab = setActiveInboxTab
  const isMobile = useIsMobile()

  const token = useMemo(() => getAccessToken(), [])
  useEffect(() => {
    if (!token) router.replace("/login?next=/inbox")
  }, [router, token])

  // URL → store. Single direction; the store is a derived mirror so other
  // components (CommandPalette / ConversationRow highlight) can read it
  // without subscribing to pathname themselves.
  const urlConversationId = useMemo(() => {
    const m = pathname.match(CONVERSATION_PATH_RE)
    return m?.[1] ?? null
  }, [pathname])
  useEffect(() => {
    if (urlConversationId !== selectedConversationId) {
      selectConversation(urlConversationId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlConversationId])

  // Legacy `/inbox?c=<id>` URLs (from PR #60 before we moved to path-style).
  // Honor them once on mount and rewrite to the canonical path so old
  // bookmarks / push notifications keep working.
  useEffect(() => {
    if (urlConversationId) return
    const legacy = searchParams.get("c")
    if (!legacy) return
    router.replace(`/inbox/${legacy}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ESC closes the open chat by navigating back to /inbox. No store mutation
  // here — the store will follow the URL via the effect above.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && urlConversationId) {
        router.push("/inbox")
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [router, urlConversationId])

  const totalUnread = conversations.filter((c) => c.needsReply && !c.isArchived).length
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Messenger` : "Messenger"
  }, [totalUnread])

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
      case "rozetka":
        return conversations.filter((c) => c.channelType === "rozetka" && !c.isArchived && !c.isSnoozed)
      case "snoozed":
        return conversations.filter((c) => c.isSnoozed && !c.isArchived)
      case "archive":
        return conversations.filter((c) => c.isArchived)
      default:
        return conversations
    }
  }, [activeTab, conversations])

  const unreadCount = totalUnread
  const snoozedCount = conversations.filter((c) => c.isSnoozed && !c.isArchived).length
  const selectedConversation = conversations.find((c) => c.id === selectedConversationId)

  // On mobile, show either list OR chat, not both.
  const showList = !isMobile || !urlConversationId
  const showChat = !isMobile || !!urlConversationId

  // `h-dvh` (dynamic viewport height) tracks the *visible* viewport on
  // iOS Safari — shrinks when the soft keyboard opens and expands again
  // when it dismisses. Pre-fix used `h-screen` (= `100vh`) which on iOS
  // froze at the initial layout height including the URL bar, leaving a
  // black gap below the chat input when the keyboard was up. See
  // `app/layout.tsx`'s `viewport` export for the matching meta knobs.
  return (
    <div className="flex h-dvh bg-background overflow-hidden">
      <CommandPalette />

      {showList && (
        <div className="flex flex-col border-r border-border overflow-hidden w-full md:w-[340px] md:shrink-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <h1 className="text-sm font-bold">Messenger</h1>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="⌘K"
                onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              >
                <Command className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowTagManager(true)}
                title="Теги"
              >
                <Tag className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowStatusManager(true)}
                title="Статуси"
              >
                <Activity className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => router.push("/templates")}
                title="Шаблони"
              >
                <FileText className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => router.push("/settings")}
                title="Налаштування"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  void (async () => {
                    await logout()
                    router.replace("/login?next=/inbox")
                  })()
                }}
                title="Вийти"
              >
                ⎋
              </Button>
            </div>
          </div>

          <InboxDashboard />

          <InboxTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            unreadCount={unreadCount}
            snoozedCount={snoozedCount}
          />

          <ConversationList
            conversations={filtered}
            emptyIcon={activeTab === "archive" ? "archive" : activeTab === "snoozed" ? "snoozed" : "inbox"}
            {...(activeTab === "archive"
              ? { emptyTitle: "Архів порожній", emptySubtitle: "Архівовані діалоги зʼявляться тут" }
              : activeTab === "snoozed"
                ? { emptyTitle: "Немає відкладених", emptySubtitle: "Відкладені діалоги зʼявляться тут після snooze" }
                : activeTab === "unread"
                  ? { emptyTitle: "Все прочитано! 🎉", emptySubtitle: "Немає непрочитаних повідомлень" }
                  : {})}
          />
        </div>
      )}

      {showChat && (
        <div className="flex-1 flex min-w-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</div>

          <AnimatePresence>
            {!isMobile && showBuyerSidebar && selectedConversation && <BuyerSidebar conversation={selectedConversation} />}
          </AnimatePresence>

          {isMobile && selectedConversation && (
            <Sheet
              open={showBuyerSidebar}
              onOpenChange={(open) => {
                if (!open) useAppStore.getState().toggleBuyerSidebar()
              }}
            >
              <SheetContent side="bottom" className="rounded-t-xl h-[85vh] p-0 overflow-hidden">
                <SheetTitle className="sr-only">Деталі покупця</SheetTitle>
                <BuyerSidebar conversation={selectedConversation} />
              </SheetContent>
            </Sheet>
          )}
        </div>
      )}

      {isMobile && !urlConversationId && (
        <Button
          size="icon"
          className="fixed bottom-5 right-5 h-12 w-12 rounded-full shadow-lg z-30"
          onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      <TagManagerModal open={showTagManager} onOpenChange={setShowTagManager} />
      <StatusManagerModal open={showStatusManager} onOpenChange={setShowStatusManager} />
    </div>
  )
}

const InboxLayout = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={null}>
    <InboxLayoutInner>{children}</InboxLayoutInner>
  </Suspense>
)

export default InboxLayout
