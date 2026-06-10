import { ExternalLink } from 'lucide-react';
import type { Conversation } from '@/types';

interface ChatContextCardProps {
  conversation: Conversation;
}

// Pinned product context inside the messages scroll area. Always sticks to
// the top so the operator never loses sight of WHICH listing the conversation
// is about. Telegram-style: visible inline at the top of the message list,
// pinned via `position: sticky` once the user scrolls past it. Renders only
// when the worker has populated the context fields (OLX listing path: PR #72).
export function ChatContextCard({ conversation }: ChatContextCardProps) {
  if (!conversation.contextTitle && !conversation.contextThumbUrl) {
    return null;
  }

  const href = conversation.contextExternalUrl ?? null;
  const inner = (
    <div className="flex items-center gap-3 p-2.5">
      {conversation.contextThumbUrl ? (
        <img
          src={conversation.contextThumbUrl}
          alt={conversation.contextTitle ?? 'Товар'}
          loading="lazy"
          className="h-14 w-14 rounded-md object-cover shrink-0 bg-muted"
        />
      ) : (
        <div className="h-14 w-14 rounded-md bg-muted shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        {conversation.contextTitle ? (
          <p className="text-sm font-medium text-foreground break-words line-clamp-2 leading-tight">
            {conversation.contextTitle}
          </p>
        ) : null}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {conversation.contextPrice != null ? (
            <p className="text-sm font-semibold text-orange-600">
              {conversation.contextPrice.toLocaleString('uk-UA')} {conversation.contextCurrency ?? ''}
            </p>
          ) : null}
          {conversation.contextStatusName ? (
            <span className="inline-flex items-center text-[11px] leading-none px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
              {conversation.contextStatusName}
            </span>
          ) : null}
        </div>
      </div>
      {href ? (
        <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
      ) : null}
    </div>
  );

  return (
    <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-3 bg-surface-elevated/95 backdrop-blur border-b border-border/60 shadow-sm">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block hover:bg-accent/30 transition-colors"
          title={conversation.contextTitle ?? 'Перейти до оголошення'}
        >
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
}
