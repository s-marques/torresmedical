import { Injectable } from '@nestjs/common';
import { exportProfissionaisQuerySchema } from '@torres/shared';
import {
  ExportacaoLoteFontes,
  FonteExportacaoLoteBase,
} from '../../../common/export/exportacao-lote.fontes';
import type { TabelaDoLote } from '../../../common/export/exportacao-lote.fontes';
import { ProfissionaisService } from './profissionais.service';

/** Fonte da exportação em lote (issue #158): mesma consulta e colunas do grid, sem filtros. */
@Injectable()
export class ProfissionaisLoteFonte extends FonteExportacaoLoteBase {
  readonly entidade = 'profissionais' as const;

  constructor(
    registro: ExportacaoLoteFontes,
    private readonly servico: ProfissionaisService,
  ) {
    super(registro);
  }

  async tabelas(): Promise<TabelaDoLote[]> {
    const arquivo = await this.servico.export(
      exportProfissionaisQuerySchema.parse({ format: 'csv' }),
    );
    return [{ nome: 'profissionais', arquivo }];
  }
}
