import { cn } from '@/lib/utils';
import { Conversation } from '@/types';
import { useAppStore } from '@/store';
import { ChannelBadge } from '@/components/ChannelBadge';
import { formatMessageTime, formatSnoozedUntil } from '@/lib/date-utils';
import { Pin, Clock, Bell, CheckSquare, Square } from 'lucide-react';
import { useMemo } from 'react';

interface ConversationRowProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

const paymentIcons: Record<string, string> = {
  pending: '⏳',
  paid: '✅',
  partial: '💳',
  refunded: '↩️',
};

export function ConversationRow({ conversation, isSelected, onClick }: ConversationRowProps) {
  const status = useAppStore((s) => (conversation.statusId ? s.statuses.find((x) => x.id === conversation.statusId) : null));
  const tags = useAppStore((s) => s.tags);
  const convTags = useMemo(
    () =>
      conversation.tagIds
        .slice(0, 4)
        .map((id) => tags.find((t) => t.id === id))
        .filter(Boolean),
    [conversation.tagIds, tags],
  );
  const extraTags = Math.max(0, conversation.tagIds.length - 4);
  const bulkSelectedIds = useAppStore((s) => s.bulkSelectedIds);
  const toggleBulkSelect = useAppStore((s) => s.toggleBulkSelect);
  const isBulkMode = bulkSelectedIds.length > 0;
  const isBulkSelected = bulkSelectedIds.includes(conversation.id);

  const initials = conversation.buyerName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);

  const handleClick = () => {
    if (isBulkMode) {
      toggleBulkSelect(conversation.id);
    } else {
      onClick();
    }
  };

  const handleLongPress = (e: React.MouseEvent) => {
    if (e.detail === 2) {
      e.preventDefault();
      toggleBulkSelect(conversation.id);
    }
  };

  return (
    <button
      onClick={handleClick}
      onDoubleClick={(e) => { e.preventDefault(); toggleBulkSelect(conversation.id); }}
      className={cn(
        'w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50 border-b border-border/50',
        isSelected && 'bg-accent',
        isBulkSelected && 'bg-primary/10',
        conversation.unreadCount > 0 && 'font-medium'
      )}
    >
      {/* Bulk checkbox */}
      {isBulkMode && (
        <div className="shrink-0 mt-1">
          {isBulkSelected ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : (
            <Square className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      )}

      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground">
          {initials}
        </div>
        <ChannelBadge
          type={conversation.channelType}
          size="sm"
          className="absolute -bottom-0.5 -right-0.5"
        />
        {conversation.isOnline && (
          <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-channel-olx border-2 border-background" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-sm font-medium text-foreground">
              {conversation.buyerName}
            </span>
            {conversation.buyerHistory?.isRepeatBuyer && (
              <span className="text-[9px] shrink-0">⭐</span>
            )}
            {conversation.isPinned && (
              <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            {conversation.isSnoozed && (
              <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </div>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {formatMessageTime(conversation.lastMessageTime)}
          </span>
        </div>

        {/* Account alias */}
        <div className="text-[11px] text-muted-foreground truncate">
          {conversation.accountAlias || '—'}
        </div>

        {/* Last message + badges */}
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">
            {conversation.lastMessage}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {conversation.followUpAt && (
              <Bell className="h-3 w-3 text-primary" />
            )}
            {conversation.needsReply && (
              <span className="h-2 w-2 rounded-full bg-needs-reply" />
            )}
            {conversation.unreadCount > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {conversation.unreadCount}
              </span>
            )}
          </div>
        </div>

        {/* Status + Tags + Payment */}
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {conversation.paymentStatus && (
            <span className={cn(
              'text-[10px] px-1 py-0.5 rounded-sm',
              conversation.paymentStatus === 'paid' ? 'bg-channel-olx/15 text-channel-olx' :
              conversation.paymentStatus === 'pending' ? 'bg-yellow-500/15 text-yellow-500' :
              conversation.paymentStatus === 'refunded' ? 'bg-destructive/15 text-destructive' :
              'bg-primary/15 text-primary'
            )}>
              {paymentIcons[conversation.paymentStatus]}
            </span>
          )}
          {conversation.shippingStatus && conversation.shippingStatus !== 'not_shipped' && (
            <span className={cn(
              'text-[10px] px-1 py-0.5 rounded-sm',
              conversation.shippingStatus === 'shipped' ? 'bg-primary/15 text-primary' :
              conversation.shippingStatus === 'delivered' ? 'bg-channel-olx/15 text-channel-olx' :
              'bg-destructive/15 text-destructive'
            )}>
              {conversation.shippingStatus === 'shipped' ? '🚚' : conversation.shippingStatus === 'delivered' ? '📦✅' : '↩️'}
            </span>
          )}
          {status && (
            <span
              className="inline-flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `hsl(${status.color} / 0.15)`, color: `hsl(${status.color})` }}
            >
              <span>{status.icon}</span>
              <span className="hidden lg:inline">{status.name}</span>
            </span>
          )}
          {convTags.map((tag) =>
            tag ? (
              <span key={tag.id} className="text-[11px]" title={tag.name}>
                {tag.icon}
              </span>
            ) : null
          )}
          {extraTags > 0 && (
            <span className="text-[10px] text-muted-foreground">+{extraTags}</span>
          )}
          {conversation.isSnoozed && conversation.snoozedUntil && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              ⏰ {formatSnoozedUntil(conversation.snoozedUntil)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
