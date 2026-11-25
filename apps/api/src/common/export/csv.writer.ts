import { formatValue } from './export-values';
import type { ExportColumnType, ExportTable } from './export.types';

/** Separador do Excel em pt-BR (a vírgula é o separador decimal). */
export const CSV_SEPARATOR = ';';
/** Marca de ordem de bytes UTF-8: o Excel reconhece os acentos do arquivo. */
export const CSV_BOM = String.fromCodePoint(0xfeff);
const EOL = '\r\n';
/** Caracteres que o Excel interpreta como início de fórmula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * CSV em UTF-8 com BOM (abre com acentos no Excel), separador `;` e CRLF.
 * Números sem separador de milhar (decimal com vírgula); datas e booleanos como nas outras
 * exportações. Texto que começa com `= + - @` ganha um apóstrofo para não virar fórmula
 * (CSV injection), exceto números negativos de colunas numéricas.
 */
export function writeCsv(table: ExportTable): Buffer {
  const lines = [
    table.columns.map((column) => cell(column.header, 'text')),
    ...table.rows.map((row) => row.map((value, index) => cell(value, table.columns[index]?.type))),
  ].map((fields) => fields.join(CSV_SEPARATOR));
  return Buffer.from(CSV_BOM + lines.join(EOL) + EOL, 'utf8');
}

function cell(value: unknown, type: ExportColumnType = 'text'): string {
  const text = isNumeric(type) ? numberText(value) : formatValue(value, type);
  return quote(isNumeric(type) ? text : neutralize(text));
}

function isNumeric(type: ExportColumnType): boolean {
  return type === 'number' || type === 'currency';
}

function numberText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(String(value));
  return Number.isFinite(number) ? String(number).replace('.', ',') : neutralize(String(value));
}

function neutralize(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

function quote(text: string): string {
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
