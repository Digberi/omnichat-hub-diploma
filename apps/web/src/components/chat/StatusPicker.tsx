import { useAppStore } from '@/store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface StatusPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  currentStatusId?: string;
}

export function StatusPicker({ open, onOpenChange, conversationId, currentStatusId }: StatusPickerProps) {
  const statuses = useAppStore((s) => s.statuses);
  const setConversationStatus = useAppStore((s) => s.setConversationStatus);

  const handleSelect = (statusId: string | undefined) => {
    setConversationStatus(conversationId, statusId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-base">Обрати статус</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {/* Clear status */}
          <button
            onClick={() => handleSelect(undefined)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors',
              !currentStatusId && 'bg-accent'
            )}
          >
            <span className="text-muted-foreground">—</span>
            <span>Без статусу</span>
          </button>
          {statuses.map((status) => (
            <button
              key={status.id}
              onClick={() => handleSelect(status.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors',
                currentStatusId === status.id && 'bg-accent'
              )}
            >
              <span>{status.icon}</span>
              <span>{status.name}</span>
              <span
                className="ml-auto h-2 w-2 rounded-full"
                style={{ backgroundColor: `hsl(${status.color})` }}
              />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
