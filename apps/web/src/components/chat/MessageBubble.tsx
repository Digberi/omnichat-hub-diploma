import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Conversation, Message } from '@/types';
import { formatFullTime } from '@/lib/date-utils';
import { Check, CheckCheck, Clock, AlertCircle, Reply, Smile, Paperclip } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAppStore } from '@/store';
import {
  isOlxDeliveryNoticeMeta,
  isOlxMessageAttachmentMeta,
  isProbablyImageUrl,
  isProbablyVideoUrl,
  isRozetkaOrderCreatedMeta,
  isRozetkaOrderStatusChangedMeta,
  type OlxMessageAttachmentMeta,
} from '@/types/messageMetadata';
import { OlxDeliveryNoticeCard } from './OlxDeliveryNoticeCard';
import { RozetkaOrderCreatedCard } from './RozetkaOrderCreatedCard';
import { RozetkaOrderStatusChangedCard } from './RozetkaOrderStatusChangedCard';

interface MessageBubbleProps {
  message: Message;
  onReply?: (message: Message) => void;
  // Optional — used to enrich the OLX delivery notice card when its own
  // `metadata.advert` is null (true for every message ingested before
  // PR #74's flat-advert_id fix). Falls back to the conversation-level
  // product context populated by the backfill / lazy-fill path.
  conversation?: Conversation;
}

const reactionEmojis = ['👍', '✅', '💰', '📦', '🚚', '❓'];

function MessageStatusIcon({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'sending':
      return <Clock className="h-3 w-3 text-muted-foreground animate-pulse-soft" />;
    case 'sent':
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case 'delivered':
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case 'read':
      return <CheckCheck className="h-3 w-3 text-primary" />;
    case 'error':
      return <AlertCircle className="h-3 w-3 text-destructive" />;
    default:
      return null;
  }
}

function LinkPreview({ url }: { url: string }) {
  return (
    <div className="mt-1.5 rounded-md border border-border/50 bg-muted/50 p-2 text-[11px]">
      <p className="text-primary truncate">{url}</p>
      <p className="text-muted-foreground mt-0.5">Посилання</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

export function MessageBubble({ message, onReply, conversation }: MessageBubbleProps) {
  // Hooks must be called unconditionally (Rules of Hooks), even though the
  // structured-event branches below early-return without using them.
  const isOut = message.direction === 'out';
  const [reactions, setReactions] = useState<string[]>([]);
  const [showActions, setShowActions] = useState(false);
  const openAttachment = useAppStore((s) => s.openAttachment);

  // Synthesized event messages (Rozetka order created / status changed) carry
  // structured metadata. Render dedicated cards instead of the text bubble.
  const meta = (message as Message & { metadata?: unknown }).metadata;
  if (isRozetkaOrderCreatedMeta(meta)) {
    return (
      <div className="flex justify-start">
        <RozetkaOrderCreatedCard meta={meta} timestamp={message.timestamp} />
      </div>
    );
  }
  if (isRozetkaOrderStatusChangedMeta(meta)) {
    return (
      <div className="flex justify-start">
        <RozetkaOrderStatusChangedCard meta={meta} timestamp={message.timestamp} />
      </div>
    );
  }
  if (isOlxDeliveryNoticeMeta(meta)) {
    // Fallback advert info from conversation.context* when the message's
    // own metadata.advert is null. This rescues every delivery card
    // ingested before the flat advert_id fix (PR #74) — the operator
    // sees the product image/title/price as soon as the conversation
    // context is populated (by lazy-fill on the next message, or by the
    // one-shot backfill).
    const fallbackAdvert =
      conversation?.contextExternalId &&
      (conversation.contextTitle || conversation.contextThumbUrl || conversation.contextExternalUrl)
        ? {
            id: conversation.contextExternalId,
            title: conversation.contextTitle ?? null,
            imageUrl: conversation.contextThumbUrl ?? null,
            priceText:
              conversation.contextPrice != null
                ? `${conversation.contextPrice.toLocaleString('uk-UA')} ${conversation.contextCurrency ?? ''}`.trim()
                : null,
            advertUrl: conversation.contextExternalUrl ?? null,
          }
        : null;
    return (
      <div className="flex justify-start">
        <OlxDeliveryNoticeCard meta={meta} timestamp={message.timestamp} fallbackAdvert={fallbackAdvert} />
      </div>
    );
  }
  // OLX inbound attachments (photo / document / CV) live in metadata because
  // the OLX Partner v2 API returns them as bare { name, url } refs — we don't
  // mirror them into Spaces, so the Attachment model doesn't apply. Carry them
  // alongside the regular text bubble below.
  const olxAttachments: OlxMessageAttachmentMeta | null = isOlxMessageAttachmentMeta(meta) ? meta : null;

  // Detect URLs in text
  const urlMatch = message.text.match(/https?:\/\/[^\s]+/);

  const handleReaction = (emoji: string) => {
    setReactions((prev) =>
      prev.includes(emoji) ? prev.filter((e) => e !== emoji) : [...prev, emoji]
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn('flex group', isOut ? 'justify-end' : 'justify-start')}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="relative max-w-[75%]">
        {/* Reply quote if exists */}
        {message.replyTo && (
          <div className={cn(
            'text-[10px] px-2 py-1 mb-0.5 rounded-t-lg border-l-2',
            isOut ? 'border-primary-foreground/30 bg-bubble-out/80' : 'border-primary/50 bg-bubble-in/80'
          )}>
            <p className="font-medium truncate">{message.replyTo}</p>
          </div>
        )}

        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm',
            isOut
              ? 'bg-bubble-out text-bubble-out-foreground rounded-br-md'
              : 'bg-bubble-in text-bubble-in-foreground rounded-bl-md'
          )}
        >
          {message.attachments && message.attachments.length > 0 ? (
            <div className="space-y-1 mb-1.5">
              {message.attachments.map((att) => {
                // For IMAGE / VIDEO kinds the API ships a 7-day presigned
                // `previewUrl` so we can render the media inline straight
                // away — no per-bubble round-trip. Clicking the image
                // opens it full-size in a new tab via the same short-link
                // flow used for DOCUMENT kinds, so URL TTL / sharing UX
                // stays consistent.
                if (att.type === 'image' && att.previewUrl) {
                  return (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => openAttachment(att.id)}
                      className="block max-w-full overflow-hidden rounded-md"
                      title={att.name}
                    >
                      <img
                        src={att.previewUrl}
                        alt={att.name}
                        loading="lazy"
                        className="max-w-full max-h-80 object-cover rounded-md"
                      />
                    </button>
                  );
                }
                if (att.type === 'video' && att.previewUrl) {
                  return (
                    <video
                      key={att.id}
                      src={att.previewUrl}
                      controls
                      preload="metadata"
                      className="max-w-full max-h-80 rounded-md"
                    />
                  );
                }
                return (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => openAttachment(att.id)}
                    className={cn(
                      'w-full text-left rounded-md border border-border/50 bg-muted/50 px-2 py-1.5 hover:bg-accent/30 transition-colors',
                      isOut ? 'border-bubble-out-foreground/15' : ''
                    )}
                    title="Відкрити (коротке посилання на 7 днів)"
                  >
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{att.name}</p>
                        {typeof att.sizeBytes === 'number' ? (
                          <p className="text-[10px] text-muted-foreground">{formatBytes(att.sizeBytes)}</p>
                        ) : null}
                      </div>
                      <span className="text-[10px] text-primary">Відкрити</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/*
            Suppress the text bubble when its body is just the OLX
            attachment-only placeholder (e.g. "📎 Фото") — that string only
            exists so the inbox-list preview isn't blank; the inline image /
            video / link below already conveys the same information.
          */}
          {message.text.length > 0 &&
          !(olxAttachments && message.text.startsWith('\u{1F4CE} ')) ? (
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          ) : null}

          {/*
            Historic empty-bubble fallback. Pre-PR-#60 the OLX worker
            discarded `attachments[]` / `cvs[]` for ingested messages —
            we attempted a backfill (PR #68) but OLX no longer returns
            those URLs via the Partner API for older messages, so the
            data is irrecoverable. Render a muted hint so the operator
            knows there WAS media here (and to check OLX directly if
            they need it) rather than seeing a confusing empty bubble.
          */}
          {message.text.length === 0 &&
          !olxAttachments &&
          (!message.attachments || message.attachments.length === 0) ? (
            <p className="text-xs italic text-muted-foreground/80">
              📎 Медіа (історичне, недоступне через OLX API)
            </p>
          ) : null}

          {olxAttachments ? (
            <div className={cn('space-y-1.5', message.text.length > 0 ? 'mt-1.5' : '')}>
              {olxAttachments.items.map((item, idx) => {
                const label = item.name ?? (item.kind === 'cv' ? 'CV' : 'Вкладення');
                if (isProbablyImageUrl(item.url, item.name)) {
                  return (
                    <a
                      key={`${item.url}-${idx}`}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg overflow-hidden border border-border/40"
                      title={label}
                    >
                      <img
                        src={item.url}
                        alt={label}
                        loading="lazy"
                        className="max-h-64 w-full object-cover"
                      />
                    </a>
                  );
                }
                if (isProbablyVideoUrl(item.url, item.name)) {
                  return (
                    <video
                      key={`${item.url}-${idx}`}
                      src={item.url}
                      controls
                      preload="metadata"
                      className="w-full rounded-lg max-h-64 bg-black/40"
                    />
                  );
                }
                return (
                  <a
                    key={`${item.url}-${idx}`}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'flex items-center gap-2 rounded-md border border-border/50 bg-muted/50 px-2 py-1.5 hover:bg-accent/30 transition-colors',
                      isOut ? 'border-bubble-out-foreground/15' : '',
                    )}
                    title={label}
                  >
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="min-w-0 flex-1 text-xs font-medium truncate">{label}</span>
                    <span className="text-[10px] text-primary">Відкрити</span>
                  </a>
                );
              })}
            </div>
          ) : null}

          {/* Link preview */}
          {urlMatch && <LinkPreview url={urlMatch[0]} />}

          <div
            className={cn(
              'flex items-center gap-1 mt-1',
              isOut ? 'justify-end' : 'justify-start'
            )}
          >
            <span className={cn('text-[10px]', isOut ? 'text-bubble-out-foreground/70' : 'text-muted-foreground')}>
              {formatFullTime(message.timestamp)}
            </span>
            {isOut && <MessageStatusIcon status={message.status} />}
          </div>
        </div>

        {/* Reactions */}
        {reactions.length > 0 && (
          <div className={cn('flex gap-0.5 mt-0.5', isOut ? 'justify-end' : 'justify-start')}>
            {reactions.map((emoji) => (
              <motion.button
                key={emoji}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-xs bg-muted rounded-full px-1 py-0.5 hover:bg-accent transition-colors"
                onClick={() => handleReaction(emoji)}
              >
                {emoji}
              </motion.button>
            ))}
          </div>
        )}

        {/* Hover actions */}
        <AnimatePresence>
          {showActions && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                'absolute top-0 flex items-center gap-0.5 bg-card border border-border rounded-md shadow-sm p-0.5',
                isOut ? 'right-full mr-1' : 'left-full ml-1'
              )}
            >
              {/* Reply */}
              <button
                onClick={() => onReply?.(message)}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent transition-colors"
                title="Відповісти"
              >
                <Reply className="h-3 w-3 text-muted-foreground" />
              </button>
              {/* Emoji reaction */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent transition-colors"
                    title="Реакція"
                  >
                    <Smile className="h-3 w-3 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1" side={isOut ? 'left' : 'right'}>
                  <div className="flex gap-0.5">
                    {reactionEmojis.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(emoji)}
                        className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors text-base"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="flex justify-start"
    >
      <div className="bg-bubble-in rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-typing-dot"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
