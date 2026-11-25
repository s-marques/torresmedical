import { Injectable } from '@nestjs/common';
import { exportContasReceberQuerySchema } from '@torres/shared';
import {
  ExportacaoLoteFontes,
  FonteExportacaoLoteBase,
} from '../../../common/export/exportacao-lote.fontes';
import type { TabelaDoLote } from '../../../common/export/exportacao-lote.fontes';
import { ContasReceberService } from './contas-receber.service';

/** Fonte da exportação em lote (issue #158): mesma consulta e colunas do grid, sem filtros. */
@Injectable()
export class ContasReceberLoteFonte extends FonteExportacaoLoteBase {
  readonly entidade = 'contas-receber' as const;

  constructor(
    registro: ExportacaoLoteFontes,
    private readonly servico: ContasReceberService,
  ) {
    super(registro);
  }

  async tabelas(): Promise<TabelaDoLote[]> {
    const arquivo = await this.servico.export(
      exportContasReceberQuerySchema.parse({ format: 'csv' }),
    );
    return [{ nome: 'contas-receber', arquivo }];
  }
}
