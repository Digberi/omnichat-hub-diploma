import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store';
import { Conversation } from '@/types';
import { ConversationRow } from './ConversationRow';
import { BulkActionsBar } from './BulkActionsBar';
import { SwipeableRow } from './SwipeableRow';
import { Input } from '@/components/ui/input';
import { Search, Inbox, Archive, Clock, Pin, PinOff } from 'lucide-react';
import { SearchOverlay } from './SearchOverlay';
import { AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/hooks/use-toast';

interface ConversationListProps {
  conversations: Conversation[];
  emptyIcon?: 'inbox' | 'archive' | 'snoozed';
  emptyTitle?: string;
  emptySubtitle?: string;
}

export function ConversationList({ conversations, emptyIcon = 'inbox', emptyTitle, emptySubtitle }: ConversationListProps) {
  const router = useRouter();
  const { selectedConversationId, searchQuery, setSearchQuery, archiveConversation, pinConversation, unpinConversation } = useAppStore();
  // Row clicks navigate to /inbox/<id> instead of mutating the store
  // directly. The layout's URL → store effect keeps `selectedConversationId`
  // in sync so highlighting still works.
  const openConversation = (id: string) => router.push(`/inbox/${id}`);
  const [showSearch, setShowSearch] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const isMobile = useIsMobile();
  const listRef = useRef<HTMLDivElement | null>(null);
  const ROW_HEIGHT = 84;
  const OVERSCAN = 10;

  const pinned = conversations.filter((c) => c.isPinned);
  const unpinned = conversations.filter((c) => !c.isPinned);

  const filtered = searchQuery
    ? conversations.filter(
        (c) =>
          c.buyerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  const displayConversations = filtered ?? [...pinned, ...unpinned];
  const shouldVirtualize = !isMobile && !filtered && displayConversations.length > 120;

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const update = () => setViewportHeight(el.clientHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const { startIndex, endIndex, offsetTop, visibleConversations } = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        startIndex: 0,
        endIndex: displayConversations.length,
        offsetTop: 0,
        visibleConversations: displayConversations,
      };
    }

    const rawStart = Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN;
    const start = Math.max(0, rawStart);
    const visibleRows = Math.ceil((viewportHeight || ROW_HEIGHT) / ROW_HEIGHT) + OVERSCAN * 2;
    const end = Math.min(displayConversations.length, start + visibleRows);

    return {
      startIndex: start,
      endIndex: end,
      offsetTop: start * ROW_HEIGHT,
      visibleConversations: displayConversations.slice(start, end),
    };
  }, [displayConversations, shouldVirtualize, scrollTop, viewportHeight]);

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* Search */}
      <div className="p-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Пошук діалогів..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setShowSearch(true)}
            className="pl-9 h-8 text-sm bg-muted border-0"
          />
        </div>
      </div>

      {/* Search Overlay */}
      <SearchOverlay open={showSearch} onClose={() => { setShowSearch(false); setSearchQuery(''); }} />

      {/* List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto scrollbar-thin"
        onScroll={(e) => {
          if (!shouldVirtualize) return;
          setScrollTop((e.currentTarget as HTMLDivElement).scrollTop);
        }}
      >
        {displayConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            {emptyIcon === 'archive' ? (
              <Archive className="h-10 w-10 text-muted-foreground mb-3" />
            ) : emptyIcon === 'snoozed' ? (
              <Clock className="h-10 w-10 text-muted-foreground mb-3" />
            ) : (
              <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
            )}
            <p className="text-sm font-medium text-foreground">{emptyTitle || 'Немає діалогів'}</p>
            <p className="text-xs text-muted-foreground mt-1">{emptySubtitle || 'Підключіть канал для початку роботи'}</p>
          </div>
        ) : (
          <>
            {!filtered && pinned.length > 0 && (
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted/50">
                📌 Закріплені
              </div>
            )}
            {shouldVirtualize && (
              <div aria-hidden style={{ height: offsetTop }} />
            )}
            {(shouldVirtualize ? visibleConversations : displayConversations).map((conv) => {
              const row = (
                <ConversationRow
                  key={conv.id}
                  conversation={conv}
                  isSelected={selectedConversationId === conv.id}
                  onClick={() => openConversation(conv.id)}
                />
              );

              if (isMobile) {
                return (
                  <SwipeableRow
                    key={conv.id}
                    onSwipeLeft={() => {
                      archiveConversation(conv.id);
                      toast({ title: 'Архівовано', description: conv.buyerName });
                    }}
                    onSwipeRight={() => {
                      if (conv.isPinned) {
                        unpinConversation(conv.id);
                        toast({ title: 'Відкріплено' });
                      } else {
                        pinConversation(conv.id);
                        toast({ title: 'Закріплено 📌' });
                      }
                    }}
                    rightLabel={conv.isPinned ? 'Відкріпити' : 'Закріпити'}
                    rightIcon={conv.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  >
                    {row}
                  </SwipeableRow>
                );
              }

              return row;
            })}
            {shouldVirtualize && (
              <div
                aria-hidden
                style={{
                  height: Math.max(0, displayConversations.length * ROW_HEIGHT - (endIndex - startIndex) * ROW_HEIGHT),
                  marginTop: 0,
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Bulk actions */}
      <AnimatePresence>
        <BulkActionsBar />
      </AnimatePresence>

      {/* Last update */}
      <div className="px-3 py-1.5 text-[10px] text-center text-muted-foreground border-t border-border shrink-0">
        Останнє оновлення: 2 с тому
      </div>
    </div>
  );
}
