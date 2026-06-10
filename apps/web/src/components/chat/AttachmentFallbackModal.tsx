import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Link2 } from 'lucide-react';

interface AttachmentFallbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileType: string;
  channelName: string;
  onCreateLink: () => void;
}

export function AttachmentFallbackModal({
  open,
  onOpenChange,
  fileType,
  channelName,
  onCreateLink,
}: AttachmentFallbackModalProps) {
  const [remember, setRemember] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Файл не підтримується</DialogTitle>
          <DialogDescription className="text-xs">
            Цей канал ({channelName}) не підтримує {fileType}. Створити коротке посилання? (діє 7 днів)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="remember"
              checked={remember}
              onCheckedChange={(v) => setRemember(!!v)}
            />
            <label htmlFor="remember" className="text-xs text-muted-foreground cursor-pointer">
              Запам&apos;ятати для цього каналу
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-9 text-sm" onClick={() => onOpenChange(false)}>
              Скасувати
            </Button>
            <Button
              className="flex-1 h-9 text-sm"
              onClick={() => {
                onCreateLink();
                onOpenChange(false);
              }}
            >
              <Link2 className="h-4 w-4 mr-1" />
              Створити лінк
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
