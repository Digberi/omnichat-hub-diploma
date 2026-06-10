import { useState } from 'react';
import { useAppStore } from '@/store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format, addHours, setHours, setMinutes, addDays } from 'date-fns';
import { uk } from 'date-fns/locale';
import { CalendarIcon, Clock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SnoozeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
}

export function SnoozeModal({ open, onOpenChange, conversationId }: SnoozeModalProps) {
  const snoozeConversation = useAppStore((s) => s.snoozeConversation);
  const [customDate, setCustomDate] = useState<Date>();
  const [customHour, setCustomHour] = useState('09');
  const [customMinute, setCustomMinute] = useState('00');

  const handleSnooze = (until: Date) => {
    snoozeConversation(conversationId, until.toISOString());
    onOpenChange(false);
  };

  const now = new Date();
  const inOneHour = addHours(now, 1);
  const thisEvening = setMinutes(setHours(now, 20), 0);
  const tomorrowMorning = setMinutes(setHours(addDays(now, 1), 9), 0);

  const handleCustomSnooze = () => {
    if (!customDate) return;
    const d = new Date(customDate);
    d.setHours(parseInt(customHour), parseInt(customMinute));
    handleSnooze(d);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Snooze діалог</DialogTitle>
          <DialogDescription className="text-xs">
            Push-сповіщення на нові повідомлення вимкнені поки діалог snoozed
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {/* Quick options */}
          <Button
            variant="outline"
            className="w-full justify-start text-sm h-9"
            onClick={() => handleSnooze(inOneHour)}
          >
            <Clock className="h-4 w-4 mr-2" />
            Через 1 годину — {format(inOneHour, 'HH:mm')}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start text-sm h-9"
            onClick={() => handleSnooze(thisEvening)}
          >
            <Clock className="h-4 w-4 mr-2" />
            Сьогодні ввечері — 20:00
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start text-sm h-9"
            onClick={() => handleSnooze(tomorrowMorning)}
          >
            <Clock className="h-4 w-4 mr-2" />
            Завтра зранку — 09:00
          </Button>

          {/* Custom */}
          <div className="border-t border-border pt-3 mt-3">
            <p className="text-xs text-muted-foreground mb-2">Або оберіть час:</p>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'flex-1 justify-start text-left text-sm h-9',
                      !customDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    {customDate
                      ? format(customDate, 'd MMM', { locale: uk })
                      : 'Дата'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customDate}
                    onSelect={setCustomDate}
                    disabled={(d) => d < new Date()}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <Select value={customHour} onValueChange={setCustomHour}>
                <SelectTrigger className="w-16 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i).padStart(2, '0')}>
                      {String(i).padStart(2, '0')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="flex items-center text-muted-foreground">:</span>
              <Select value={customMinute} onValueChange={setCustomMinute}>
                <SelectTrigger className="w-16 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['00', '15', '30', '45'].map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full mt-2 h-9 text-sm"
              disabled={!customDate}
              onClick={handleCustomSnooze}
            >
              Встановити
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
