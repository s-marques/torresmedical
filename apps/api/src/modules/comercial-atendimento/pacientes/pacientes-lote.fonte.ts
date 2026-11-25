import { Injectable } from '@nestjs/common';
import { exportPacientesQuerySchema } from '@torres/shared';
import {
  ExportacaoLoteFontes,
  FonteExportacaoLoteBase,
} from '../../../common/export/exportacao-lote.fontes';
import type { TabelaDoLote } from '../../../common/export/exportacao-lote.fontes';
import { PacientesService } from './pacientes.service';

/** Fonte da exportação em lote (issue #158): mesma consulta e colunas do grid, sem filtros. */
@Injectable()
export class PacientesLoteFonte extends FonteExportacaoLoteBase {
  readonly entidade = 'pacientes' as const;

  constructor(
    registro: ExportacaoLoteFontes,
    private readonly servico: PacientesService,
  ) {
    super(registro);
  }

  async tabelas(): Promise<TabelaDoLote[]> {
    const arquivo = await this.servico.export(exportPacientesQuerySchema.parse({ format: 'csv' }));
    return [{ nome: 'pacientes', arquivo }];
  }
}
