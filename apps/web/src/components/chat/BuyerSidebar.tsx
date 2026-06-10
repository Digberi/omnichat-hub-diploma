import { useState } from 'react';
import { useAppStore } from '@/store';
import { Conversation } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  X, User, ShoppingBag, Star, StickyNote, Truck, CreditCard,
  Clock, Phone, Copy, ExternalLink, Bell, BellOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { formatMessageTime } from '@/lib/date-utils';

interface BuyerSidebarProps {
  conversation: Conversation;
}

const paymentLabels = {
  pending: { label: 'Очікує оплати', color: 'text-yellow-500 bg-yellow-500/10' },
  paid: { label: 'Оплачено', color: 'text-channel-olx bg-channel-olx/10' },
  partial: { label: 'Частково', color: 'text-primary bg-primary/10' },
  refunded: { label: 'Повернено', color: 'text-destructive bg-destructive/10' },
};

const shippingLabels = {
  not_shipped: { label: 'Не відправлено', color: 'text-muted-foreground bg-muted' },
  shipped: { label: 'Відправлено', color: 'text-primary bg-primary/10' },
  delivered: { label: 'Доставлено', color: 'text-channel-olx bg-channel-olx/10' },
  returned: { label: 'Повернення', color: 'text-destructive bg-destructive/10' },
};

export function BuyerSidebar({ conversation }: BuyerSidebarProps) {
  const { setSellerNote, setTtn, setPaymentStatus, setFollowUp, toggleBuyerSidebar } = useAppStore();
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(conversation.sellerNote || '');
  const [editingTtn, setEditingTtn] = useState(false);
  const [ttnText, setTtnText] = useState(conversation.ttn || '');

  const history = conversation.buyerHistory;

  const handleSaveNote = () => {
    setSellerNote(conversation.id, noteText);
    setEditingNote(false);
    toast({ title: 'Нотатку збережено' });
  };

  const handleSaveTtn = () => {
    if (ttnText.trim()) {
      setTtn(conversation.id, ttnText.trim());
      setEditingTtn(false);
      toast({ title: 'ТТН збережено', description: `ТТН: ${ttnText.trim()}` });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} скопійовано` });
  };

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 280, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="border-l border-border h-full flex flex-col overflow-hidden bg-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-semibold">Деталі покупця</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleBuyerSidebar}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Buyer info */}
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
                {conversation.buyerName.split(' ').map(w => w[0]).join('').slice(0, 2)}
              </div>
              {conversation.isOnline && (
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-channel-olx border-2 border-card" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{conversation.buyerName}</p>
              <p className="text-[10px] text-muted-foreground">
                {conversation.isOnline ? 'Онлайн' : conversation.lastSeen ? `Був ${formatMessageTime(conversation.lastSeen)}` : 'Офлайн'}
              </p>
            </div>
          </div>

          {conversation.buyerPhone && (
            <button
              onClick={() => copyToClipboard(conversation.buyerPhone!, 'Телефон')}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Phone className="h-3 w-3" />
              {conversation.buyerPhone}
              <Copy className="h-2.5 w-2.5 ml-auto" />
            </button>
          )}

          {/* Buyer rating */}
          {history && history.totalOrders > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star
                    key={i}
                    className={cn('h-3 w-3', i <= (history.rating || 0) ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground/30')}
                  />
                ))}
              </div>
              <span className="text-muted-foreground">
                {history.totalOrders} {history.totalOrders === 1 ? 'замовлення' : 'замовлень'}
              </span>
              {history.isRepeatBuyer && (
                <span className="text-[10px] bg-channel-olx/15 text-channel-olx px-1 py-0.5 rounded">Постійний</span>
              )}
            </div>
          )}
        </div>

        {/* Payment & Shipping */}
        <div className="p-3 border-b border-border space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Замовлення</p>

          {conversation.orderAmount && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Сума</span>
              <span className="text-sm font-bold">{conversation.orderAmount.toLocaleString('uk-UA')} грн</span>
            </div>
          )}

          {conversation.paymentStatus && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" /> Оплата</span>
              <button
                onClick={() => {
                  const next = conversation.paymentStatus === 'pending' ? 'paid' : 'pending';
                  setPaymentStatus(conversation.id, next);
                }}
                className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded', paymentLabels[conversation.paymentStatus].color)}
              >
                {paymentLabels[conversation.paymentStatus].label}
              </button>
            </div>
          )}

          {conversation.shippingStatus && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" /> Доставка</span>
              <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded', shippingLabels[conversation.shippingStatus].color)}>
                {shippingLabels[conversation.shippingStatus].label}
              </span>
            </div>
          )}

          {/* TTN */}
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Truck className="h-3 w-3" /> ТТН
            </span>
            {editingTtn ? (
              <div className="flex gap-1">
                <Input
                  value={ttnText}
                  onChange={(e) => setTtnText(e.target.value)}
                  placeholder="20450000..."
                  className="h-7 text-xs"
                  autoFocus
                />
                <Button size="sm" className="h-7 text-xs px-2" onClick={handleSaveTtn}>💾</Button>
              </div>
            ) : conversation.ttn ? (
              <div className="flex items-center gap-1">
                <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{conversation.ttn}</span>
                <button onClick={() => copyToClipboard(conversation.ttn!, 'ТТН')} className="text-muted-foreground hover:text-foreground">
                  <Copy className="h-3 w-3" />
                </button>
                <button onClick={() => setEditingTtn(true)} className="text-muted-foreground hover:text-foreground text-[10px]">✏️</button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="h-7 text-xs w-full" onClick={() => setEditingTtn(true)}>
                + Додати ТТН
              </Button>
            )}
          </div>
        </div>

        {/* Follow-up */}
        <div className="p-3 border-b border-border space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Нагадування</p>
          {conversation.followUpAt ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs">
                <Bell className="h-3 w-3 text-primary" />
                <span>{formatMessageTime(conversation.followUpAt)}</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFollowUp(conversation.id, undefined)}>
                <BellOff className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs w-full"
              onClick={() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(10, 0, 0, 0);
                setFollowUp(conversation.id, tomorrow.toISOString());
                toast({ title: 'Нагадування встановлено на завтра 10:00' });
              }}
            >
              <Bell className="h-3 w-3 mr-1" /> Нагадати завтра
            </Button>
          )}
        </div>

        {/* Seller notes */}
        <div className="p-3 border-b border-border space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
            <StickyNote className="h-3 w-3" /> Нотатки продавця
          </p>
          {editingNote ? (
            <div className="space-y-1.5">
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Внутрішня нотатка..."
                className="min-h-[60px] text-xs resize-none"
                autoFocus
              />
              <div className="flex gap-1">
                <Button size="sm" className="h-7 text-xs flex-1" onClick={handleSaveNote}>Зберегти</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingNote(false)}>Скасувати</Button>
              </div>
            </div>
          ) : conversation.sellerNote ? (
            <button
              onClick={() => { setNoteText(conversation.sellerNote || ''); setEditingNote(true); }}
              className="w-full text-left text-xs bg-muted/50 rounded p-2 hover:bg-accent transition-colors whitespace-pre-wrap"
            >
              {conversation.sellerNote}
            </button>
          ) : (
            <Button variant="outline" size="sm" className="h-7 text-xs w-full" onClick={() => setEditingNote(true)}>
              + Додати нотатку
            </Button>
          )}
        </div>

        {/* Buyer history */}
        {history && history.totalOrders > 0 && (
          <div className="p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
              <ShoppingBag className="h-3 w-3" /> Історія покупок
            </p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Всього замовлень</span>
                <span className="font-medium">{history.totalOrders}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Загальна сума</span>
                <span className="font-medium">{history.totalSpent.toLocaleString('uk-UA')} грн</span>
              </div>
              {history.lastOrderDate && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Останнє замовлення</span>
                  <span className="font-medium">{formatMessageTime(history.lastOrderDate)}</span>
                </div>
              )}
              {history.previousProducts.length > 0 && (
                <div className="space-y-1 mt-2">
                  <p className="text-[10px] text-muted-foreground">Попередні товари:</p>
                  {history.previousProducts.map((pid) => (
                    <div key={pid} className="text-xs bg-muted/50 rounded p-1.5 font-mono truncate">
                      {pid}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
