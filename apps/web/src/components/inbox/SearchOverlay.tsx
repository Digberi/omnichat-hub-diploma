import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, MessageSquare, Users } from 'lucide-react';
import { formatMessageTime } from '@/lib/date-utils';

import type { components } from '@omnichat/api-client';

import { api } from '@/lib/api';
import { clearTokens, getAccessToken } from '@/lib/tokens';

type SearchResponseDto = components['schemas']['SearchResponseDto'];

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [showOlder, setShowOlder] = useState(false);
  const { conversations, selectConversation, jumpToMessage } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponseDto | null>(null);

  const token = useMemo(() => getAccessToken(), []);

  useEffect(() => {
    if (!open) return;
    if (!token) return;

    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setLoading(false);
      return;
    }

    const t = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const res = await api.GET('/v1/search', {
            params: {
              query: {
                query: trimmed,
                showOlder: showOlder ? '1' : '0',
                limit: 50,
              },
            },
          });
          if (res.response.status === 401) {
            clearTokens();
            setResults(null);
            return;
          }
          if (!res.data) throw new Error(`Search failed: ${res.response.status}`);
          setResults(res.data as SearchResponseDto);
        } catch {
          setResults({ conversations: [], messages: [] });
        } finally {
          setLoading(false);
        }
      })();
    }, 200);

    return () => clearTimeout(t);
  }, [open, query, showOlder, token]);

  const handleOpenConversation = (conversationId: string) => {
    selectConversation(conversationId);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 bg-background flex flex-col">
      {/* Search header */}
      <div className="flex items-center gap-2 p-2 border-b border-border">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Пошук діалогів та повідомлень..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 h-9 text-sm bg-muted border-0"
          />
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {!query.trim() ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <Search className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">Введіть запит для пошуку</p>
          </div>
        ) : (
          <div className="p-2 space-y-4">
            {loading && (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                Пошук...
              </div>
            )}

            {/* Conversations section */}
            {results?.conversations?.length ? (
              <div>
                <div className="flex items-center gap-1.5 px-2 py-1">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Діалоги
                  </span>
                </div>
                {results.conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => handleOpenConversation(conv.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent transition-colors text-left"
                  >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                      {conv.buyerDisplayName.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{conv.buyerDisplayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{conv.contextTitle || ''}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            {/* Messages section */}
            {results?.messages?.length ? (
              <div>
                <div className="flex items-center gap-1.5 px-2 py-1">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Повідомлення
                  </span>
                </div>
                {results.messages.map((msg) => {
                  const buyerName = conversations.find((c) => c.id === msg.conversationId)?.buyerName ?? 'Діалог';
                  return (
                  <button
                    key={msg.id}
                    onClick={() => {
                      jumpToMessage(msg.conversationId, msg.id);
                      onClose();
                    }}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{buyerName}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{msg.text || ''}</p>
                  </button>
                  );
                })}
              </div>
            ) : null}

            {/* Show older toggle */}
            {!showOlder && query.trim() && (
              <div className="text-center py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => setShowOlder(true)}
                >
                  Показати старіші (7+ днів)
                </Button>
              </div>
            )}

            {results && results.conversations.length === 0 && results.messages.length === 0 && !loading && (
              <div className="text-center py-8">
                <p className="text-xs text-muted-foreground">Нічого не знайдено</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
