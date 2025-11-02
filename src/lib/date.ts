import { format, parse, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';

const TIMEZONE = 'America/Sao_Paulo';

export function formatDate(date: Date | string, formatStr: string = 'dd/MM/yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const zonedDate = toZonedTime(d, TIMEZONE);
  return format(zonedDate, formatStr, { locale: ptBR });
}

export function formatDateLong(date: Date | string): string {
  return formatDate(date, "d 'de' MMMM 'de' yyyy");
}

export function formatDatetime(date: Date | string): string {
  return formatDate(date, "dd/MM/yyyy 'às' HH:mm");
}

export function parseDate(dateStr: string, formatStr: string = 'dd/MM/yyyy'): Date {
  return parse(dateStr, formatStr, new Date(), { locale: ptBR });
}

export function toUTC(date: Date): Date {
  return fromZonedTime(date, TIMEZONE);
}

export function toLocal(date: Date): Date {
  return toZonedTime(date, TIMEZONE);
}

export function getMonthStart(date: Date = new Date()): Date {
  return startOfMonth(toZonedTime(date, TIMEZONE));
}

export function getMonthEnd(date: Date = new Date()): Date {
  return endOfMonth(toZonedTime(date, TIMEZONE));
}

export function getMonthDays(date: Date = new Date()): Date[] {
  const start = getMonthStart(date);
  const end = getMonthEnd(date);
  return eachDayOfInterval({ start, end });
}

export function getToday(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

export function getTodayISO(): string {
  return format(getToday(), 'yyyy-MM-dd');
}

export function getMonthYearISO(date: Date = new Date()): string {
  return format(getMonthStart(date), 'yyyy-MM-dd');
}

export function formatMonthYear(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(toZonedTime(d, TIMEZONE), 'MMMM/yyyy', { locale: ptBR });
}

