import { useEffect, useRef, useMemo, useState, type DragEvent, type ClipboardEvent } from 'react';
import { useAppStore } from '@/store';
import { toast } from '@/hooks/use-toast';
import { Conversation, Message } from '@/types';
import { ChatHeader } from './ChatHeader';
import { ChatContextCard } from './ChatContextCard';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { formatDateDivider } from '@/lib/date-utils';
import { parseISO, isSameDay } from 'date-fns';
import { MessageSquare, Upload } from 'lucide-react';
import { motion } from 'framer-motion';

interface ChatWindowProps {
  conversation: Conversation;
}

const EMPTY_MESSAGES: Message[] = [];

// Mirrors the server-side FileInterceptor limit in
// apps/api/src/modules/messages/messages.controller.ts. The server still
// validates, this is just a friendlier client-side reject.
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function isDragWithFiles(e: DragEvent<HTMLDivElement>): boolean {
  // `dataTransfer.items` is the modern surface (works while dragging, before
  // drop), `dataTransfer.types` is the legacy fallback. We accept any drag
  // that includes at least one item of `kind === "file"`, otherwise we
  // ignore (so dragging text or links inside the chat doesn't open the
  // overlay).
  const dt = e.dataTransfer;
  if (!dt) return false;
  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i += 1) {
      if (dt.items[i].kind === 'file') return true;
    }
    return false;
  }
  return Array.from(dt.types ?? []).includes('Files');
}

export function ChatWindow({ conversation }: ChatWindowProps) {
  // IMPORTANT: do not allocate new arrays/objects inside Zustand selectors.
  // React expects getSnapshot() to be referentially stable when store state didn't change.
  const messages = useAppStore((s) => s.messages[conversation.id] ?? EMPTY_MESSAGES);
  const markAsRead = useAppStore((s) => s.markAsRead);
  const sendAttachment = useAppStore((s) => s.sendAttachment);
  const endRef = useRef<HTMLDivElement>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  // `dragDepth` tracks nested dragenter/dragleave events so child-element
  // boundaries don't toggle the overlay off mid-drag (e.g. moving the
  // cursor from the message list onto the input still counts as "still
  // dragging over the chat"). Decrement on every dragleave; only hide when
  // it drops to 0 or on drop/end.
  const dragDepthRef = useRef(0);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    markAsRead(conversation.id);
  }, [conversation.id, markAsRead]);

  // Reset the drag UI when switching conversations — avoids a stale overlay
  // if the user starts a drag, then changes thread via keyboard before
  // releasing.
  useEffect(() => {
    dragDepthRef.current = 0;
    setDragActive(false);
  }, [conversation.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const grouped = useMemo(() => {
    const groups: { date: string; messages: typeof messages }[] = [];
    messages.forEach((msg) => {
      const last = groups[groups.length - 1];
      if (last && isSameDay(parseISO(last.date), parseISO(msg.timestamp))) {
        last.messages.push(msg);
      } else {
        groups.push({ date: msg.timestamp, messages: [msg] });
      }
    });
    return groups;
  }, [messages]);

  const handleReply = (message: Message) => {
    setReplyTo(message);
  };

  const handleFiles = (files: FileList | File[] | null | undefined) => {
    if (!files) return;
    // Use a normal array so we can iterate safely even if it's a FileList.
    const list = Array.from(files);
    if (list.length === 0) return;

    // Same upstream channels (OLX/Prom/Rozetka) all cap at 10MB after we
    // multipart it; reject early to give the user a useful message instead
    // of a 413 from multer. The send path itself surfaces server-side
    // errors via the optimistic message → "error" status flow.
    for (const file of list) {
      if (file.size > MAX_FILE_BYTES) {
        toast({
          title: 'Файл задовгий',
          description: `${file.name}: максимум 10 MB`,
        });
        continue;
      }
      sendAttachment(conversation.id, file);
    }
  };

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!isDragWithFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    if (!dragActive) setDragActive(true);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!isDragWithFiles(e)) return;
    // MUST preventDefault to allow drop. Without this the browser falls
    // back to its default behavior (navigate to the file URL), which is
    // exactly the bug users were hitting before this fix.
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!isDragWithFiles(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!isDragWithFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    handleFiles(e.dataTransfer?.files);
  };

  // Paste image directly from clipboard. Common UX (Telegram/Slack-style)
  // — useful for screenshots without a save-to-disk roundtrip. We only
  // intercept when the clipboard contains files (text paste continues to
  // land in the textarea unaffected).
  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    handleFiles(files);
  };

  return (
    <motion.div
      key={conversation.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="relative flex flex-col h-full"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      <ChatHeader conversation={conversation} />

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1">
        <ChatContextCard conversation={conversation} />
        {grouped.map((group) => (
          <div key={group.date}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex justify-center my-3"
            >
              <span className="text-[11px] text-muted-foreground bg-muted rounded-full px-3 py-0.5">
                {formatDateDivider(group.date)}
              </span>
            </motion.div>
            <div className="space-y-1.5">
              {group.messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onReply={handleReply}
                  conversation={conversation}
                />
              ))}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <ChatInput
        conversationId={conversation.id}
        channelType={conversation.channelType}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />

      {dragActive && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-md"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="h-8 w-8" />
            <p className="text-sm font-medium">Відпустіть, щоб надіслати файл</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function EmptyChatState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center h-full text-center p-6"
    >
      <MessageSquare className="h-12 w-12 text-muted-foreground mb-3" />
      <p className="text-sm font-medium text-foreground">Оберіть діалог</p>
      <p className="text-xs text-muted-foreground mt-1">
        Виберіть діалог зі списку зліва для початку спілкування
      </p>
    </motion.div>
  );
}
