import { useMemo } from 'react';
import { useAppStore } from '@/store';
import { cn } from '@/lib/utils';
import { MessageSquare, Clock, AlertTriangle, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

export function InboxDashboard() {
  const conversations = useAppStore((s) => s.conversations);
  const inboxMetrics = useAppStore((s) => s.inboxMetrics);

  const stats = useMemo(() => {
    const active = conversations.filter((c) => !c.isArchived);
    const needsReply = active.filter((c) => c.needsReply).length;
    const unread = active.filter((c) => c.unreadCount > 0).length;
    const snoozed = active.filter((c) => c.isSnoozed).length;
    const avgResponseMin = inboxMetrics?.avgResponseMin ?? null;

    // Channel breakdown
    const olxCount = active.filter((c) => c.channelType === 'olx').length;
    const promCount = active.filter((c) => c.channelType === 'prom').length;

    // Status breakdown
    const statusMap: Record<string, number> = {};
    active.forEach((c) => {
      if (c.statusId) {
        statusMap[c.statusId] = (statusMap[c.statusId] || 0) + 1;
      }
    });

    const hourlyActivity = Array.isArray(inboxMetrics?.hourlyActivity) ? inboxMetrics!.hourlyActivity : Array(24).fill(0);

    return { needsReply, unread, snoozed, avgResponseMin, olxCount, promCount, hourlyActivity, total: active.length };
  }, [conversations, inboxMetrics]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-3 py-2 border-b border-border space-y-2"
    >
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-1.5">
        <StatCard
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          value={stats.needsReply}
          label="Потребують відповіді"
          color="text-primary"
          bgColor="bg-primary/10"
        />
        <StatCard
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          value={stats.unread}
          label="Непрочитаних"
          color="text-destructive"
          bgColor="bg-destructive/10"
        />
        <StatCard
          icon={<Clock className="h-3.5 w-3.5" />}
          value={stats.avgResponseMin != null ? `${stats.avgResponseMin} хв` : "—"}
          label="Сер. відповідь"
          color="text-channel-olx"
          bgColor="bg-channel-olx/10"
        />
        <StatCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          value={stats.total}
          label="Активних"
          color="text-channel-prom"
          bgColor="bg-channel-prom/10"
        />
      </div>

      {/* Activity chart */}
      <div className="flex items-end gap-px h-6">
        {stats.hourlyActivity.map((val, i) => {
          const max = Math.max(...stats.hourlyActivity);
          const height = max > 0 ? (val / max) * 100 : 0;
          const now = new Date().getHours();
          return (
            <div
              key={i}
              className={cn(
                'flex-1 rounded-t-sm transition-all min-h-[1px]',
                i === now ? 'bg-primary' : 'bg-muted-foreground/20'
              )}
              style={{ height: `${Math.max(height, 4)}%` }}
              title={`${String(i).padStart(2, '0')}:00 — ${val} повідомлень`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[8px] text-muted-foreground/50">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </motion.div>
  );
}

function StatCard({
  icon,
  value,
  label,
  color,
  bgColor,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className={cn('rounded-md p-1.5 text-center', bgColor)}>
      <div className={cn('flex items-center justify-center gap-1', color)}>
        {icon}
        <span className="text-sm font-bold">{value}</span>
      </div>
      <p className="text-[8px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
    </div>
  );
}
