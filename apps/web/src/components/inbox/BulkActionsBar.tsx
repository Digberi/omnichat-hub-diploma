import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Archive, Tag, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function BulkActionsBar() {
  const { bulkSelectedIds, clearBulkSelection, bulkArchive, bulkTag, tags } = useAppStore();

  if (bulkSelectedIds.length === 0) return null;

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      className="absolute bottom-12 left-2 right-2 z-20 flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 shadow-lg"
    >
      <span className="text-xs font-medium text-primary">
        {bulkSelectedIds.length} обрано
      </span>
      <div className="flex-1" />
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={bulkArchive}>
        <Archive className="h-3 w-3" /> Архівувати
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            <Tag className="h-3 w-3" /> Тег
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-1" side="top">
          {tags.map(tag => (
            <button
              key={tag.id}
              onClick={() => bulkTag(tag.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors"
            >
              <span>{tag.icon}</span>
              <span>{tag.name}</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearBulkSelection}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </motion.div>
  );
}
