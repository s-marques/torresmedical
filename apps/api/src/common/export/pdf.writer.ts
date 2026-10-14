import PDFDocument from 'pdfkit';
import { EXPORT_TIME_ZONE, formatValue } from './export-values';
import type { ExportTable } from './export.types';

const MARGIN = 36;
const CELL_PADDING = 4;
const FONT_SIZE = 8;
const HEADER_FILL = '#E5E7EB';
const LINE_COLOR = '#D1D5DB';
/** A partir de quantas colunas a página fica em paisagem. */
const LANDSCAPE_FROM = 6;

const GENERATED_AT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: EXPORT_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
});

type Doc = InstanceType<typeof PDFDocument>;

/**
 * PDF A4 com título, data de geração, tabela com cabeçalho repetido a cada página
 * e "Página X de Y". Usa a Helvetica padrão do PDF (acentos do português incluídos).
 */
export function writePdf(table: ExportTable): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: table.columns.length >= LANDSCAPE_FROM ? 'landscape' : 'portrait',
    margin: MARGIN,
    bufferPages: true,
    info: { Title: table.title, Creator: 'Torres Medical' },
  });
  const done = collect(doc);

  doc.font('Helvetica-Bold').fontSize(14).text(table.title);
  doc
    .font('Helvetica')
    .fontSize(FONT_SIZE)
    .fillColor('#4B5563')
    .text(`Gerado em ${GENERATED_AT.format(table.generatedAt)}`)
    .fillColor('black')
    .moveDown();

  drawTable(doc, table);
  drawPageNumbers(doc);
  doc.end();
  return done;
}

function drawTable(doc: Doc, table: ExportTable): void {
  const widths = columnWidths(doc, table);
  const header = table.columns.map((column) => column.header);
  drawRow(doc, header, widths, { bold: true });

  if (table.rows.length === 0) {
    doc.font('Helvetica-Oblique').text('Nenhum registro encontrado', MARGIN, doc.y + CELL_PADDING);
    return;
  }
  for (const row of table.rows) {
    const cells = row.map((value, index) => formatValue(value, table.columns[index]?.type));
    if (doc.y + rowHeight(doc, cells, widths) > doc.page.maxY()) {
      doc.addPage();
      drawRow(doc, header, widths, { bold: true });
    }
    drawRow(doc, cells, widths);
  }
}

function drawRow(
  doc: Doc,
  cells: string[],
  widths: number[],
  options: { bold?: boolean } = {},
): void {
  doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FONT_SIZE);
  const top = doc.y;
  const height = rowHeight(doc, cells, widths);
  const width = widths.reduce((sum, w) => sum + w, 0);

  if (options.bold) doc.rect(MARGIN, top, width, height).fill(HEADER_FILL).fillColor('black');
  let x = MARGIN;
  cells.forEach((cell, index) => {
    const cellWidth = widths[index] ?? 0;
    doc.text(cell, x + CELL_PADDING, top + CELL_PADDING, { width: cellWidth - CELL_PADDING * 2 });
    x += cellWidth;
  });
  doc
    .moveTo(MARGIN, top + height)
    .lineTo(MARGIN + width, top + height)
    .strokeColor(LINE_COLOR)
    .lineWidth(0.5)
    .stroke();
  doc.x = MARGIN;
  doc.y = top + height;
}

function rowHeight(doc: Doc, cells: string[], widths: number[]): number {
  const tallest = Math.max(
    ...cells.map((cell, index) =>
      doc.heightOfString(cell || ' ', { width: (widths[index] ?? 0) - CELL_PADDING * 2 }),
    ),
  );
  return tallest + CELL_PADDING * 2;
}

/** Larguras proporcionais ao `width` de cada coluna, ocupando a largura útil da página. */
function columnWidths(doc: Doc, table: ExportTable): number[] {
  const available = doc.page.width - MARGIN * 2;
  const weights = table.columns.map((column) => column.width ?? 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return weights.map((weight) => (available * weight) / total);
}

function drawPageNumbers(doc: Doc): void {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    const bottom = doc.page.maxY() + MARGIN / 2;
    // Margem inferior zerada para o texto do rodapé não criar página nova.
    const margins = doc.page.margins;
    doc.page.margins = { ...margins, bottom: 0 };
    doc
      .font('Helvetica')
      .fontSize(FONT_SIZE)
      .fillColor('#4B5563')
      .text(`Página ${index + 1} de ${range.count}`, MARGIN, bottom, {
        width: doc.page.width - MARGIN * 2,
        align: 'right',
      });
    doc.page.margins = margins;
  }
}

function collect(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}
