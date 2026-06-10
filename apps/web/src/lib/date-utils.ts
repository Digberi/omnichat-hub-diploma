import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';

export function formatMessageTime(timestamp: string): string {
  const date = parseISO(timestamp);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Вчора';
  return format(date, 'dd.MM', { locale: uk });
}

export function formatFullTime(timestamp: string): string {
  const date = parseISO(timestamp);
  return format(date, 'HH:mm', { locale: uk });
}

export function formatDateDivider(timestamp: string): string {
  const date = parseISO(timestamp);
  if (isToday(date)) return 'Сьогодні';
  if (isYesterday(date)) return 'Вчора';
  return format(date, 'd MMMM yyyy', { locale: uk });
}

export function formatSnoozedUntil(timestamp: string): string {
  const date = parseISO(timestamp);
  if (isToday(date)) return `до ${format(date, 'HH:mm')}`;
  return `до ${format(date, 'd MMM HH:mm', { locale: uk })}`;
}
