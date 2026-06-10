import { cn } from '@/lib/utils';
import { ChannelType } from '@/types';

interface ChannelBadgeProps {
  type: ChannelType;
  size?: 'sm' | 'md';
  className?: string;
}

export function ChannelBadge({ type, size = 'sm', className }: ChannelBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold uppercase',
        size === 'sm' && 'h-4 w-4 text-[8px]',
        size === 'md' && 'h-5 w-5 text-[9px]',
        type === 'olx' && 'bg-channel-olx text-white',
        type === 'prom' && 'bg-channel-prom text-white',
        type === 'rozetka' && 'bg-channel-rozetka text-white',
        className
      )}
    >
      {type === 'olx' ? 'O' : type === 'prom' ? 'P' : 'R'}
    </span>
  );
}
