import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ExportFormat } from '@torres/shared';
import { BusinessException } from '../errors/api.exception';
import { writeCsv } from './csv.writer';
import { EXPORT_TIME_ZONE } from './export-values';
import type { ExportColumn, ExportFile, ExportRequest, ExportTable } from './export.types';
import { writePdf } from './pdf.writer';
import { writeXlsx } from './xlsx.writer';

/** Limite da exportação síncrona. Acima disso, o usuário refina os filtros (relatórios grandes vão para fila). */
export const EXPORT_MAX_ROWS = 10_000;

const CONTENT_TYPES: Readonly<Record<ExportFormat, string>> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  csv: 'text/csv; charset=utf-8',
};

/** Marca a execução da exportação em lote (fila), que não tem o teto de linhas do grid. */
const SEM_LIMITE = new AsyncLocalStorage<true>();

const WRITERS: Readonly<Record<ExportFormat, (table: ExportTable) => Buffer | Promise<Buffer>>> = {
  xlsx: writeXlsx,
  pdf: writePdf,
  csv: writeCsv,
};

const FILE_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: EXPORT_TIME_ZONE });

/**
 * Exportação Excel/PDF/CSV a partir das mesmas linhas da listagem.
 * A auditoria (EXPORT) é feita pelo `@Audit({ entity, action: 'EXPORT' })` do endpoint.
 */
@Injectable()
export class ExportService {
  /** Roda `fn` sem o teto de linhas: só para a exportação em lote, executada em fila. */
  semLimite<T>(fn: () => Promise<T>): Promise<T> {
    return SEM_LIMITE.run(true, fn);
  }

  /** Lança 422 `EXPORT_LIMIT_EXCEEDED` quando o total passa do limite (exceto em `semLimite`). */
  ensureWithinLimit(total: number): void {
    if (SEM_LIMITE.getStore()) return;
    if (total > EXPORT_MAX_ROWS) {
      throw new BusinessException(
        'EXPORT_LIMIT_EXCEEDED',
        `A exportação está limitada a ${EXPORT_MAX_ROWS.toLocaleString('pt-BR')} registros ` +
          `(encontrados ${total.toLocaleString('pt-BR')}). Refine os filtros.`,
      );
    }
  }

  async export<T>(request: ExportRequest<T>, now = new Date()): Promise<ExportFile> {
    const table = toTable(request, now);
    const buffer = await WRITERS[request.format](table);
    return {
      buffer,
      contentType: CONTENT_TYPES[request.format],
      filename: `${request.filename}-${FILE_DATE.format(now)}.${request.format}`,
    };
  }
}

/** Seleciona as colunas pedidas (na ordem pedida), mantendo só as definidas pelo recurso. */
export function selectColumns<T, K extends string>(
  columns: readonly ExportColumn<T, K>[],
  keys: readonly K[],
): ExportColumn<T, K>[] {
  return keys
    .map((key) => columns.find((column) => column.key === key))
    .filter((column): column is ExportColumn<T, K> => column !== undefined);
}

function toTable<T>(request: ExportRequest<T>, generatedAt: Date): ExportTable {
  return {
    title: request.title,
    columns: request.columns.map(({ key, header, type, width }) => ({ key, header, type, width })),
    rows: request.rows.map((row) => request.columns.map((column) => column.value(row))),
    generatedAt,
  };
}
