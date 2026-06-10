import { cn } from '@/lib/utils';
import { Inbox, MessageCircle, Clock, Archive, ShoppingBag } from 'lucide-react';

export type InboxTab = 'all' | 'unread' | 'olx' | 'prom' | 'rozetka' | 'snoozed' | 'archive';

interface InboxTabsProps {
  activeTab: InboxTab;
  onTabChange: (tab: InboxTab) => void;
  unreadCount: number;
  snoozedCount: number;
}

const tabs: { value: InboxTab; label: string; icon: React.ReactNode; activeColor?: string }[] = [
  { value: 'all', label: 'Усі', icon: <Inbox className="h-3.5 w-3.5" /> },
  { value: 'unread', label: 'Непрочитані', icon: <MessageCircle className="h-3.5 w-3.5" /> },
  { value: 'olx', label: 'OLX', icon: <ShoppingBag className="h-3.5 w-3.5" />, activeColor: 'bg-channel-olx/15 text-channel-olx border-channel-olx/40' },
  { value: 'prom', label: 'Prom', icon: <ShoppingBag className="h-3.5 w-3.5" />, activeColor: 'bg-channel-prom/15 text-channel-prom border-channel-prom/40' },
  { value: 'rozetka', label: 'Rozetka', icon: <ShoppingBag className="h-3.5 w-3.5" />, activeColor: 'bg-channel-rozetka/15 text-channel-rozetka border-channel-rozetka/40' },
  { value: 'snoozed', label: 'Відкладені', icon: <Clock className="h-3.5 w-3.5" /> },
  { value: 'archive', label: 'Архів', icon: <Archive className="h-3.5 w-3.5" /> },
];

export function InboxTabs({ activeTab, onTabChange, unreadCount, snoozedCount }: InboxTabsProps) {
  return (
    <div className="px-2 py-2 border-b border-border shrink-0">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => onTabChange(tab.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all border',
                isActive
                  ? tab.activeColor || 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-accent hover:text-foreground'
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.value === 'unread' && unreadCount > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {unreadCount}
                </span>
              )}
              {tab.value === 'snoozed' && snoozedCount > 0 && (
                <span className="text-[10px] opacity-70">({snoozedCount})</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
