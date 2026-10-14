import { Prisma } from '../../generated/prisma/client';
import { cellValue, excelNumFmt, formatValue, toLocalWallClock } from './export-values';

// 02:30 UTC = 23:30 do dia anterior em São Paulo (UTC-3).
const INSTANT = new Date('2026-10-14T02:30:00.000Z');

describe('formatValue (PDF)', () => {
  it.each([
    [1234.5, 'number', '1.234,5'],
    [new Prisma.Decimal('1234.5'), 'currency', 'R$ 1.234,50'],
    [INSTANT, 'datetime', '13/10/2026, 23:30'],
    [new Date('2026-10-14T00:00:00.000Z'), 'date', '14/10/2026'],
    ['2026-10-14T00:00:00.000Z', 'date', '14/10/2026'],
    [true, 'boolean', 'Sim'],
    [false, 'boolean', 'Não'],
    ['texto', 'text', 'texto'],
    [10, undefined, '10'],
  ] as const)('%p como %s → %p', (value, type, expected) => {
    expect(formatValue(value, type).replaceAll(' ', ' ')).toBe(expected);
  });

  it('valores ausentes ficam vazios', () => {
    expect(formatValue(null)).toBe('');
    expect(formatValue(undefined, 'number')).toBe('');
    expect(formatValue('', 'date')).toBe('');
  });

  it('valor que não converte sai como texto', () => {
    expect(formatValue('abc', 'number')).toBe('abc');
    expect(formatValue('abc', 'date')).toBe('abc');
  });
});

describe('cellValue (Excel)', () => {
  it('mantém números e datas nativos', () => {
    expect(cellValue(new Prisma.Decimal('10.5'), 'currency')).toBe(10.5);
    expect(cellValue(10n, 'number')).toBe(10);
    expect(cellValue(INSTANT, 'date')).toEqual(INSTANT);
  });

  it('datetime vira o horário de parede de São Paulo', () => {
    expect(cellValue(INSTANT, 'datetime')).toEqual(new Date('2026-10-13T23:30:00.000Z'));
  });

  it('boolean, texto e ausentes', () => {
    expect(cellValue(true, 'boolean')).toBe('Sim');
    expect(cellValue(5)).toBe('5');
    expect(cellValue(null, 'number')).toBeNull();
    expect(cellValue('abc', 'number')).toBe('abc');
  });

  it('formato numérico por tipo', () => {
    expect(excelNumFmt('currency')).toBe('"R$" #,##0.00');
    expect(excelNumFmt('datetime')).toBe('dd/mm/yyyy hh:mm');
    expect(excelNumFmt('text')).toBeUndefined();
    expect(excelNumFmt()).toBeUndefined();
  });

  it('toLocalWallClock preserva os milissegundos', () => {
    expect(toLocalWallClock(new Date('2026-07-01T15:00:00.123Z'))).toEqual(
      new Date('2026-07-01T12:00:00.123Z'),
    );
  });
});
