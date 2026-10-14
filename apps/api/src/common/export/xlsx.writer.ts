import { Workbook } from 'exceljs';
import { cellValue, excelNumFmt } from './export-values';
import type { ExportTable } from './export.types';

const DEFAULT_WIDTH = 20;
const MAX_SHEET_NAME = 31;

/** Planilha com cabeçalho em negrito, congelado e com autofiltro; valores nativos com formato. */
export async function writeXlsx(table: ExportTable): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'Torres Medical';
  workbook.created = table.generatedAt;

  const sheet = workbook.addWorksheet(sheetName(table.title), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = table.columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? DEFAULT_WIDTH,
    style: { numFmt: excelNumFmt(column.type) },
  }));
  for (const row of table.rows) {
    sheet.addRow(row.map((value, index) => cellValue(value, table.columns[index]?.type)));
  }

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  if (table.columns.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: table.columns.length },
    };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Nome de planilha válido no Excel: sem `[]:*?/\` e com até 31 caracteres. */
export function sheetName(title: string): string {
  const name = title
    .replaceAll(/[[\]:*?/\\]/g, ' ')
    .trim()
    .slice(0, MAX_SHEET_NAME);
  return name || 'Dados';
}
