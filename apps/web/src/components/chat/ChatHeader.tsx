import { Conversation, PaymentStatus, ShippingStatus } from '@/types';
import { useAppStore } from '@/store';
import { ChannelBadge } from '@/components/ChannelBadge';
import { ArrowLeft, User, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { ConversationActions } from './ConversationActions';
import { cn } from '@/lib/utils';

interface ChatHeaderProps {
  conversation: Conversation;
}

const paymentConfig: Record<PaymentStatus, { label: string; className: string }> = {
  pending: { label: '💳 Очікує', className: 'bg-yellow-500/15 text-yellow-500' },
  paid: { label: '✅ Оплачено', className: 'bg-channel-olx/15 text-channel-olx' },
  partial: { label: '💳 Частково', className: 'bg-primary/15 text-primary' },
  refunded: { label: '↩️ Повернення', className: 'bg-destructive/15 text-destructive' },
};

const shippingConfig: Record<ShippingStatus, { label: string; className: string }> = {
  not_shipped: { label: '📦 Не відправлено', className: 'bg-muted text-muted-foreground' },
  shipped: { label: '🚚 В дорозі', className: 'bg-primary/15 text-primary' },
  delivered: { label: '✅ Доставлено', className: 'bg-channel-olx/15 text-channel-olx' },
  returned: { label: '↩️ Повернення', className: 'bg-destructive/15 text-destructive' },
};

export function ChatHeader({ conversation }: ChatHeaderProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const selectConversation = useAppStore((s) => s.selectConversation);
  const toggleBuyerSidebar = useAppStore((s) => s.toggleBuyerSidebar);

  // `pt-[env(safe-area-inset-top)]` is a no-op in a Safari browser tab
  // (the URL bar already pushes content down so the inset resolves to 0)
  // but kicks in when omnichat is installed as a PWA on iPhone — there
  // the WebView fills the whole screen including the status bar gutter,
  // and without this padding the back arrow / buyer name slide under the
  // notch / time-and-battery row.
  return (
    <div className="border-b border-border shrink-0 pt-[env(safe-area-inset-top)]">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => {
              selectConversation(null);
              router.push('/inbox');
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {conversation.isOnline && (
              <span className="h-2 w-2 rounded-full bg-channel-olx shrink-0" />
            )}
            <span className="text-sm font-semibold truncate">{conversation.buyerName}</span>
            {conversation.buyerHistory?.isRepeatBuyer && (
              <span className="text-[9px] bg-channel-olx/15 text-channel-olx px-1 py-0.5 rounded shrink-0">⭐ VIP</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <ChannelBadge type={conversation.channelType} size="sm" />
            <span>{conversation.channelType === 'olx' ? 'OLX' : conversation.channelType === 'prom' ? 'Prom' : 'Rozetka'}</span>
            <span>•</span>
            <span className="truncate">{conversation.accountAlias || '—'}</span>
          </div>
        </div>

        {/* Buyer sidebar toggle */}
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={toggleBuyerSidebar} title="Деталі покупця">
          <User className="h-4 w-4" />
        </Button>
        <ConversationActions conversation={conversation} />
      </div>

      {/* Payment & Shipping badges */}
      {(conversation.paymentStatus || conversation.shippingStatus || conversation.followUpAt) && (
        <div className="flex items-center gap-1.5 px-3 py-1 border-t border-border/50 overflow-x-auto scrollbar-thin">
          {conversation.paymentStatus && (
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap', paymentConfig[conversation.paymentStatus].className)}>
              {paymentConfig[conversation.paymentStatus].label}
            </span>
          )}
          {conversation.shippingStatus && (
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap', shippingConfig[conversation.shippingStatus].className)}>
              {shippingConfig[conversation.shippingStatus].label}
            </span>
          )}
          {conversation.ttn && (
            <span className="text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full shrink-0">
              ТТН: {conversation.ttn}
            </span>
          )}
          {conversation.orderAmount && (
            <span className="text-[10px] font-bold text-foreground ml-auto shrink-0">
              {conversation.orderAmount.toLocaleString('uk-UA')} грн
            </span>
          )}
          {conversation.followUpAt && (
            <span className="text-[10px] text-primary shrink-0 flex items-center gap-0.5">
              <Bell className="h-2.5 w-2.5" /> Нагадування
            </span>
          )}
        </div>
      )}

      {/* Sticky product context moved into ChatWindow as a pinned card
          at the top of the messages list (ChatContextCard). Keeping it
          there means it scrolls/stays-pinned with the messages so the
          operator always sees which listing the conversation is about. */}
    </div>
  );
}
