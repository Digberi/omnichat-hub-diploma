import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { MessageSquare, Tag, Activity, FileText, Settings, Search, Archive, Pin, Moon, Sun } from 'lucide-react';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { conversations, settings, updateSettings } = useAppStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const activeConversations = conversations.filter((c) => !c.isArchived).slice(0, 8);

  const runAction = useCallback((fn: () => void) => {
    fn();
    setOpen(false);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Пошук діалогів, дій, навігація..." />
      <CommandList>
        <CommandEmpty>Нічого не знайдено</CommandEmpty>

        <CommandGroup heading="Діалоги">
          {activeConversations.map((conv) => (
            <CommandItem
              key={conv.id}
              onSelect={() => runAction(() => router.push(`/inbox/${conv.id}`))}
              className="gap-2"
            >
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span>{conv.buyerName}</span>
              <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-32">{conv.lastMessage}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Навігація">
          <CommandItem onSelect={() => runAction(() => router.push('/inbox'))}>
            <Search className="h-4 w-4 mr-2" /> Inbox
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => router.push('/templates'))}>
            <FileText className="h-4 w-4 mr-2" /> Шаблони
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => router.push('/settings'))}>
            <Settings className="h-4 w-4 mr-2" /> Налаштування
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Дії">
          <CommandItem onSelect={() => runAction(() => updateSettings({ darkMode: !settings.darkMode }))}>
            {settings.darkMode ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
            {settings.darkMode ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
