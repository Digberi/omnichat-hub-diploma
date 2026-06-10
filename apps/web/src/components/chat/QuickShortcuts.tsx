import { useAppStore } from '@/store';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Bookmark } from 'lucide-react';
import { useState } from 'react';

interface QuickShortcutsProps {
  onInsert: (text: string) => void;
}

export function QuickShortcuts({ onInsert }: QuickShortcutsProps) {
  const [open, setOpen] = useState(false);
  const shortcuts = useAppStore((s) => s.shortcuts);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" title="Швидкі вставки">
          <Bookmark className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start" side="top">
        <div className="p-2 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground px-1">Швидкі вставки</p>
        </div>
        <div className="max-h-48 overflow-y-auto scrollbar-thin">
          {shortcuts.map((sc) => (
            <button
              key={sc.id}
              onClick={() => {
                onInsert(sc.text);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b border-border/50 last:border-0"
            >
              <div className="flex items-center gap-1.5">
                <span>{sc.icon}</span>
                <span className="text-xs font-medium">{sc.label}</span>
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5 ml-5">{sc.text}</p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
