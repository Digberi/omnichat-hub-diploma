import { useRef, useState } from 'react';
import { useAppStore } from '@/store';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Paperclip, Send, X } from 'lucide-react';
import { TemplateSelector } from './TemplateSelector';
import { QuickShortcuts } from './QuickShortcuts';
import { ChannelType, Message } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatInputProps {
  conversationId: string;
  channelType?: ChannelType;
  replyTo?: Message | null;
  onCancelReply?: () => void;
}

export function ChatInput({ conversationId, channelType = 'olx', replyTo, onCancelReply }: ChatInputProps) {
  const [text, setText] = useState('');
  const sendMessage = useAppStore((s) => s.sendMessage);
  const sendAttachment = useAppStore((s) => s.sendAttachment);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage(conversationId, text.trim(), replyTo?.text);
    setText('');
    onCancelReply?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && replyTo) {
      onCancelReply?.();
    }
  };

  const handleTemplateSelect = (templateText: string) => {
    setText((prev) => (prev ? prev + '\n' + templateText : templateText));
  };

  const handleShortcutInsert = (shortcutText: string) => {
    setText((prev) => (prev ? prev + '\n' + shortcutText : shortcutText));
  };

  // `pb-[env(safe-area-inset-bottom)]` keeps the send button + textarea
  // above the iPhone home indicator when the page is rendered with
  // `viewport-fit=cover`. Without it the bottom row's tap targets land
  // under the swipe-up bar and feel non-clickable. Combined with the
  // parent `h-dvh` shell, the chat input now sits flush against the
  // visual viewport bottom (or the keyboard's top edge while typing).
  return (
    <div className="border-t border-border shrink-0 pb-[env(safe-area-inset-bottom)]">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          if (!file) return;
          sendAttachment(conversationId, file);
          e.target.value = '';
        }}
      />

      {/* Reply preview */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border overflow-hidden"
          >
            <div className="w-0.5 h-6 bg-primary rounded-full shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-primary font-medium">Відповідь</p>
              <p className="text-xs text-muted-foreground truncate">{replyTo.text}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onCancelReply}>
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-end gap-1.5 p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <TemplateSelector
          conversationChannelType={channelType}
          onSelect={handleTemplateSelect}
        />
        <QuickShortcuts onInsert={handleShortcutInsert} />
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Напишіть повідомлення..."
          className="min-h-[36px] max-h-[120px] resize-none border-0 bg-muted px-3 py-2 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          rows={1}
        />
        <Button
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleSend}
          disabled={!text.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
