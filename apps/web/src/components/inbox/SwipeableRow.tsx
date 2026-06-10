import { useRef, useState, ReactNode } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Archive, Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SwipeableRowProps {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftLabel?: string;
  rightLabel?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  leftColor?: string;
  rightColor?: string;
  disabled?: boolean;
}

const SWIPE_THRESHOLD = 80;

export function SwipeableRow({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftLabel = 'Архів',
  rightLabel = 'Закріпити',
  leftIcon = <Archive className="h-4 w-4" />,
  rightIcon = <Pin className="h-4 w-4" />,
  leftColor = 'bg-destructive',
  rightColor = 'bg-primary',
  disabled = false,
}: SwipeableRowProps) {
  const x = useMotionValue(0);
  const [swiping, setSwiping] = useState(false);

  const leftOpacity = useTransform(x, [-SWIPE_THRESHOLD, -30], [1, 0]);
  const rightOpacity = useTransform(x, [30, SWIPE_THRESHOLD], [0, 1]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setSwiping(false);
    if (info.offset.x < -SWIPE_THRESHOLD && onSwipeLeft) {
      onSwipeLeft();
    } else if (info.offset.x > SWIPE_THRESHOLD && onSwipeRight) {
      onSwipeRight();
    }
  };

  if (disabled) return <>{children}</>;

  return (
    <div className="relative overflow-hidden">
      {/* Left background (swipe right = pin) */}
      <motion.div
        style={{ opacity: rightOpacity }}
        className={cn('absolute inset-y-0 left-0 w-20 flex items-center justify-center', rightColor)}
      >
        <div className="flex flex-col items-center gap-0.5 text-primary-foreground">
          {rightIcon}
          <span className="text-[9px] font-medium">{rightLabel}</span>
        </div>
      </motion.div>

      {/* Right background (swipe left = archive) */}
      <motion.div
        style={{ opacity: leftOpacity }}
        className={cn('absolute inset-y-0 right-0 w-20 flex items-center justify-center', leftColor)}
      >
        <div className="flex flex-col items-center gap-0.5 text-destructive-foreground">
          {leftIcon}
          <span className="text-[9px] font-medium">{leftLabel}</span>
        </div>
      </motion.div>

      <motion.div
        drag="x"
        dragConstraints={{ left: -120, right: 120 }}
        dragElastic={0.1}
        style={{ x }}
        onDragStart={() => setSwiping(true)}
        onDragEnd={handleDragEnd}
        className="relative bg-background"
      >
        {children}
      </motion.div>
    </div>
  );
}
