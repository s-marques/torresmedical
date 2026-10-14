import type { ExportColumnType } from './export.types';

/** Fuso da clínica para datas/horas exportadas. */
export const EXPORT_TIME_ZONE = 'America/Sao_Paulo';

const NUMBER = new Intl.NumberFormat('pt-BR');
const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE_UTC = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'short' });
const DATETIME_LOCAL = new Intl.DateTimeFormat('pt-BR', {
  timeZone: EXPORT_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
});
const LOCAL_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: EXPORT_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

type Converter<R> = (value: unknown) => R | undefined;

const TEXT_FORMATTERS: Partial<Record<ExportColumnType, Converter<string>>> = {
  number: (value) => map(toNumber(value), (n) => NUMBER.format(n)),
  currency: (value) => map(toNumber(value), (n) => CURRENCY.format(n)),
  date: (value) => map(toDate(value), (d) => DATE_UTC.format(d)),
  datetime: (value) => map(toDate(value), (d) => DATETIME_LOCAL.format(d)),
  boolean: (value) => (value ? 'Sim' : 'Não'),
};

const CELL_CONVERTERS: Partial<Record<ExportColumnType, Converter<string | number | Date>>> = {
  number: toNumber,
  currency: toNumber,
  date: toDate,
  datetime: (value) => map(toDate(value), toLocalWallClock),
  boolean: (value) => (value ? 'Sim' : 'Não'),
};

/** Texto exibido no PDF. */
export function formatValue(value: unknown, type: ExportColumnType = 'text'): string {
  if (value === null || value === undefined || value === '') return '';
  return TEXT_FORMATTERS[type]?.(value) ?? String(value);
}

/** Valor nativo da célula do Excel (número, data ou texto). */
export function cellValue(
  value: unknown,
  type: ExportColumnType = 'text',
): string | number | Date | null {
  if (value === null || value === undefined) return null;
  return CELL_CONVERTERS[type]?.(value) ?? String(value);
}

/** Formato numérico da coluna no Excel. */
export function excelNumFmt(type: ExportColumnType = 'text'): string | undefined {
  const formats: Partial<Record<ExportColumnType, string>> = {
    number: '#,##0.##',
    currency: '"R$" #,##0.00',
    date: 'dd/mm/yyyy',
    datetime: 'dd/mm/yyyy hh:mm',
  };
  return formats[type];
}

/**
 * O Excel não tem fuso: grava a data/hora "de parede" de São Paulo como se fosse UTC,
 * para a célula mostrar o horário local.
 */
export function toLocalWallClock(date: Date): Date {
  const parts = Object.fromEntries(
    LOCAL_PARTS.formatToParts(date).map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return new Date(
    Date.UTC(
      parts.year as number,
      (parts.month as number) - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      date.getUTCMilliseconds(),
    ),
  );
}

function map<T, R>(value: T | undefined, fn: (value: T) => R): R | undefined {
  return value === undefined ? undefined : fn(value);
}

function toNumber(value: unknown): number | undefined {
  // Decimal do Prisma e bigint viram number; texto numérico também.
  const number = typeof value === 'number' ? value : Number(String(value));
  return Number.isFinite(number) ? number : undefined;
}

function toDate(value: unknown): Date | undefined {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}
