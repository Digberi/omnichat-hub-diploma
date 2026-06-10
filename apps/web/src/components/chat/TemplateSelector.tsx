import { useState } from 'react';
import { useAppStore } from '@/store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';
import { TemplateCategory } from '@/types';

const categoryLabels: Record<TemplateCategory, string> = {
  payment: '💳 Оплата',
  delivery: '🚚 Доставка',
  upsell: '📈 Допродаж',
  issues: '⚠️ Проблеми',
  custom: '✏️ Кастомні',
};

interface TemplateSelectorProps {
  conversationChannelType: 'olx' | 'prom' | 'rozetka';
  onSelect: (text: string) => void;
}

export function TemplateSelector({ conversationChannelType, onSelect }: TemplateSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | null>(null);
  const templates = useAppStore((s) => s.templates);

  const filtered = templates.filter(
    (t) => t.scope === 'global' || t.scope === conversationChannelType
  );

  const categories = [...new Set(filtered.map((t) => t.category))];
  const displayTemplates = selectedCategory
    ? filtered.filter((t) => t.category === selectedCategory)
    : filtered;

  const handleSelect = (text: string) => {
    onSelect(text);
    setOpen(false);
    setSelectedCategory(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground">
          <Zap className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" side="top">
        <div className="p-2 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground px-1">Шаблони</p>
        </div>
        {/* Category pills */}
        <div className="flex gap-1 p-2 overflow-x-auto scrollbar-thin border-b border-border">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 px-2 py-1 rounded text-[11px] transition-colors ${
              !selectedCategory ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            Усі
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 px-2 py-1 rounded text-[11px] transition-colors ${
                selectedCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {categoryLabels[cat]}
            </button>
          ))}
        </div>
        {/* Template list */}
        <div className="max-h-60 overflow-y-auto scrollbar-thin">
          {displayTemplates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => handleSelect(tpl.text)}
              className="w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b border-border/50 last:border-0"
            >
              <p className="text-xs font-medium">{tpl.title}</p>
              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{tpl.text}</p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
