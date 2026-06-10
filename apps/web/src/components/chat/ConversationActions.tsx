import { useState } from 'react';
import { useAppStore } from '@/store';
import { Conversation } from '@/types';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pin, PinOff, Clock, Archive, ArchiveRestore, Tag, Activity, CheckCircle2 } from 'lucide-react';
import { SnoozeModal } from './SnoozeModal';
import { StatusPicker } from './StatusPicker';
import { TagPicker } from './TagPicker';

interface ConversationActionsProps {
  conversation: Conversation;
}

export function ConversationActions({ conversation }: ConversationActionsProps) {
  const isMobile = useIsMobile();
  const [showSnooze, setShowSnooze] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);

  const {
    pinConversation,
    unpinConversation,
    archiveConversation,
    unarchiveConversation,
    unsnoozeConversation,
  } = useAppStore();

  const actions = (
    <>
      {/* Pin/Unpin */}
      {conversation.isPinned ? (
        <ActionItem
          icon={<PinOff className="h-4 w-4" />}
          label="Відкріпити"
          onClick={() => unpinConversation(conversation.id)}
        />
      ) : (
        <ActionItem
          icon={<Pin className="h-4 w-4" />}
          label="Закріпити"
          onClick={() => pinConversation(conversation.id)}
        />
      )}

      {/* Snooze */}
      {conversation.isSnoozed ? (
        <ActionItem
          icon={<Clock className="h-4 w-4" />}
          label="Зняти snooze"
          onClick={() => unsnoozeConversation(conversation.id)}
        />
      ) : (
        <ActionItem
          icon={<Clock className="h-4 w-4" />}
          label="Snooze"
          onClick={() => setShowSnooze(true)}
        />
      )}

      {/* Status */}
      <ActionItem
        icon={<Activity className="h-4 w-4" />}
        label="Статус"
        onClick={() => setShowStatusPicker(true)}
      />

      {/* Tags */}
      <ActionItem
        icon={<Tag className="h-4 w-4" />}
        label="Теги"
        onClick={() => setShowTagPicker(true)}
      />

      {/* Archive */}
      {conversation.isArchived ? (
        <ActionItem
          icon={<ArchiveRestore className="h-4 w-4" />}
          label="Розархівувати"
          onClick={() => unarchiveConversation(conversation.id)}
        />
      ) : (
        <ActionItem
          icon={<Archive className="h-4 w-4" />}
          label="Архівувати"
          onClick={() => archiveConversation(conversation.id)}
        />
      )}
    </>
  );

  if (isMobile) {
    return (
      <>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowSheet(true)}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>

        <Sheet open={showSheet} onOpenChange={setShowSheet}>
          <SheetContent side="bottom" className="rounded-t-xl">
            <SheetHeader>
              <SheetTitle className="text-sm">Дії</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-1 py-2">
              {actions}
            </div>
          </SheetContent>
        </Sheet>

        <SnoozeModal
          open={showSnooze}
          onOpenChange={setShowSnooze}
          conversationId={conversation.id}
        />
	        <StatusPicker
	          open={showStatusPicker}
	          onOpenChange={setShowStatusPicker}
	          conversationId={conversation.id}
	          {...(conversation.statusId !== undefined ? { currentStatusId: conversation.statusId } : {})}
	        />
	        <TagPicker
	          open={showTagPicker}
	          onOpenChange={setShowTagPicker}
	          conversationId={conversation.id}
          currentTagIds={conversation.tagIds}
        />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {conversation.isPinned ? (
            <DropdownMenuItem onClick={() => unpinConversation(conversation.id)}>
              <PinOff className="h-4 w-4 mr-2" /> Відкріпити
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => pinConversation(conversation.id)}>
              <Pin className="h-4 w-4 mr-2" /> Закріпити
            </DropdownMenuItem>
          )}
          {conversation.isSnoozed ? (
            <DropdownMenuItem onClick={() => unsnoozeConversation(conversation.id)}>
              <Clock className="h-4 w-4 mr-2" /> Зняти snooze
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setShowSnooze(true)}>
              <Clock className="h-4 w-4 mr-2" /> Snooze
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowStatusPicker(true)}>
            <Activity className="h-4 w-4 mr-2" /> Статус
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowTagPicker(true)}>
            <Tag className="h-4 w-4 mr-2" /> Теги
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {conversation.isArchived ? (
            <DropdownMenuItem onClick={() => unarchiveConversation(conversation.id)}>
              <ArchiveRestore className="h-4 w-4 mr-2" /> Розархівувати
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => archiveConversation(conversation.id)}>
              <Archive className="h-4 w-4 mr-2" /> Архівувати
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <SnoozeModal
        open={showSnooze}
        onOpenChange={setShowSnooze}
        conversationId={conversation.id}
      />
	      <StatusPicker
	        open={showStatusPicker}
	        onOpenChange={setShowStatusPicker}
	        conversationId={conversation.id}
	        {...(conversation.statusId !== undefined ? { currentStatusId: conversation.statusId } : {})}
	      />
	      <TagPicker
	        open={showTagPicker}
	        onOpenChange={setShowTagPicker}
	        conversationId={conversation.id}
        currentTagIds={conversation.tagIds}
      />
    </>
  );
}

function ActionItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2.5 text-sm rounded-md hover:bg-accent transition-colors text-left"
    >
      {icon}
      {label}
    </button>
  );
}
