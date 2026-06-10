import { useAppStore } from '@/store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

interface TagPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  currentTagIds: string[];
}

export function TagPicker({ open, onOpenChange, conversationId, currentTagIds }: TagPickerProps) {
  const tags = useAppStore((s) => s.tags);
  const addTagToConversation = useAppStore((s) => s.addTagToConversation);
  const removeTagFromConversation = useAppStore((s) => s.removeTagFromConversation);

  const handleToggle = (tagId: string) => {
    if (currentTagIds.includes(tagId)) {
      removeTagFromConversation(conversationId, tagId);
    } else {
      addTagToConversation(conversationId, tagId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-base">Обрати теги</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => handleToggle(tag.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
            >
              <Checkbox checked={currentTagIds.includes(tag.id)} />
              <span>{tag.icon}</span>
              <span>{tag.name}</span>
              <span
                className="ml-auto h-2 w-2 rounded-full"
                style={{ backgroundColor: `hsl(${tag.color})` }}
              />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
