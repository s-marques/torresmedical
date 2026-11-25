import { Injectable } from '@nestjs/common';
import { exportContasPagarQuerySchema } from '@torres/shared';
import {
  ExportacaoLoteFontes,
  FonteExportacaoLoteBase,
} from '../../../common/export/exportacao-lote.fontes';
import type { TabelaDoLote } from '../../../common/export/exportacao-lote.fontes';
import { ContasPagarService } from './contas-pagar.service';

/** Fonte da exportação em lote (issue #158): mesma consulta e colunas do grid, sem filtros. */
@Injectable()
export class ContasPagarLoteFonte extends FonteExportacaoLoteBase {
  readonly entidade = 'contas-pagar' as const;

  constructor(
    registro: ExportacaoLoteFontes,
    private readonly servico: ContasPagarService,
  ) {
    super(registro);
  }

  async tabelas(): Promise<TabelaDoLote[]> {
    const arquivo = await this.servico.export(
      exportContasPagarQuerySchema.parse({ format: 'csv' }),
    );
    return [{ nome: 'contas-pagar', arquivo }];
  }
}
