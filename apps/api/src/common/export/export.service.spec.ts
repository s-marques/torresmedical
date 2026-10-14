import { Workbook } from 'exceljs';
import { BusinessException } from '../errors/api.exception';
import { EXPORT_MAX_ROWS, ExportService, selectColumns } from './export.service';
import type { ExportColumn } from './export.types';
import { sheetName } from './xlsx.writer';

interface Linha {
  nome: string;
  valor: number;
  criadoEm: Date;
}

const COLUMNS: ExportColumn<Linha, 'nome' | 'valor' | 'criadoEm'>[] = [
  { key: 'nome', header: 'Nome', value: (l) => l.nome, width: 3 },
  { key: 'valor', header: 'Valor', type: 'currency', value: (l) => l.valor },
  { key: 'criadoEm', header: 'Criado em', type: 'datetime', value: (l) => l.criadoEm },
];

const ROWS: Linha[] = [
  { nome: 'Ação', valor: 10.5, criadoEm: new Date('2026-10-14T02:30:00.000Z') },
  { nome: 'Outra', valor: 0, criadoEm: new Date('2026-10-14T12:00:00.000Z') },
];

const NOW = new Date('2026-10-14T02:00:00.000Z');

async function readSheet(buffer: Buffer) {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.worksheets[0];
}

describe('ExportService', () => {
  const service = new ExportService();

  it('gera xlsx com cabeçalho, valores nativos e nome do arquivo com a data local', async () => {
    const file = await service.export(
      { format: 'xlsx', title: 'Unidades', filename: 'unidades', columns: COLUMNS, rows: ROWS },
      NOW,
    );

    expect(file.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    // 02:00 UTC ainda é dia 13 em São Paulo.
    expect(file.filename).toBe('unidades-2026-10-13.xlsx');

    const sheet = await readSheet(file.buffer);
    expect(sheet?.name).toBe('Unidades');
    expect(sheet?.getRow(1).values).toEqual([undefined, 'Nome', 'Valor', 'Criado em']);
    expect(sheet?.getRow(1).font?.bold).toBe(true);
    expect(sheet?.getCell('A2').value).toBe('Ação');
    expect(sheet?.getCell('B2').value).toBe(10.5);
    expect(sheet?.getCell('B2').numFmt).toBe('"R$" #,##0.00');
    expect(sheet?.getCell('C2').value).toEqual(new Date('2026-10-13T23:30:00.000Z'));
    expect(sheet?.rowCount).toBe(3);
  });

  it('gera pdf', async () => {
    const file = await service.export(
      { format: 'pdf', title: 'Unidades', filename: 'unidades', columns: COLUMNS, rows: ROWS },
      NOW,
    );

    expect(file.contentType).toBe('application/pdf');
    expect(file.filename).toBe('unidades-2026-10-13.pdf');
    expect(file.buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('pdf com muitas linhas quebra página; sem linhas, informa vazio', async () => {
    const muitas = Array.from(
      { length: 200 },
      (_, i) => ({ ...ROWS[0], nome: `Linha ${i}` }) as Linha,
    );
    const grande = await service.export({
      format: 'pdf',
      title: 'T',
      filename: 't',
      columns: COLUMNS,
      rows: muitas,
    });
    const vazio = await service.export({
      format: 'pdf',
      title: 'T',
      filename: 't',
      columns: COLUMNS,
      rows: [],
    });

    const pages = (buffer: Buffer) =>
      (buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages(grande.buffer)).toBeGreaterThan(1);
    expect(pages(vazio.buffer)).toBe(1);
  });

  it('pdf em paisagem a partir de 6 colunas', async () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({
      key: `c${i}`,
      header: `C${i}`,
      value: () => i,
    }));
    const file = await service.export({
      format: 'pdf',
      title: 'T',
      filename: 't',
      columns: seis,
      rows: [{}],
    });

    // A4 paisagem: 841.89 x 595.28.
    expect(file.buffer.toString('latin1')).toMatch(/\/MediaBox \[0 0 841\.89 595\.28\]/);
  });

  it('limita a exportação síncrona', () => {
    expect(() => service.ensureWithinLimit(EXPORT_MAX_ROWS)).not.toThrow();
    expect(() => service.ensureWithinLimit(EXPORT_MAX_ROWS + 1)).toThrow(BusinessException);
    try {
      service.ensureWithinLimit(EXPORT_MAX_ROWS + 1);
    } catch (error) {
      expect((error as BusinessException).code).toBe('EXPORT_LIMIT_EXCEEDED');
      expect((error as BusinessException).getStatus()).toBe(422);
    }
  });
});

describe('selectColumns', () => {
  it('respeita a ordem pedida e ignora desconhecidas', () => {
    const keys = selectColumns(COLUMNS, ['valor', 'nome']).map((c) => c.key);
    expect(keys).toEqual(['valor', 'nome']);
    expect(selectColumns(COLUMNS, ['x' as 'nome'])).toEqual([]);
  });
});

describe('sheetName', () => {
  it('remove caracteres proibidos e limita a 31', () => {
    expect(sheetName('Contas a Pagar / Receber: 2026?')).toBe('Contas a Pagar   Receber  2026');
    expect(sheetName('x'.repeat(40))).toHaveLength(31);
    expect(sheetName('[]')).toBe('Dados');
  });
});
