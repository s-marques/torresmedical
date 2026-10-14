import type { ExportFormat } from '@torres/shared';

/**
 * Tipos de coluna:
 * - `date`: data sem hora (`@db.Date`), formatada em UTC para não mudar o dia;
 * - `datetime`: instante (`timestamptz`), formatado no fuso da clínica.
 */
export type ExportColumnType = 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean';

export interface ExportColumn<T, K extends string = string> {
  key: K;
  header: string;
  type?: ExportColumnType;
  value: (row: T) => unknown;
  /** Largura relativa (Excel: caracteres; PDF: proporção). */
  width?: number;
}

export interface ExportRequest<T> {
  format: ExportFormat;
  /** Título do documento e nome da planilha. */
  title: string;
  /** Base do nome do arquivo, sem data nem extensão (ex.: `unidades`). */
  filename: string;
  columns: readonly ExportColumn<T>[];
  rows: readonly T[];
}

export interface ExportFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/** Tabela já resolvida: valores brutos por coluna, independente do formato. */
export interface ExportTable {
  title: string;
  columns: readonly Pick<ExportColumn<unknown>, 'key' | 'header' | 'type' | 'width'>[];
  rows: readonly unknown[][];
  generatedAt: Date;
}
