import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { exportContratosSalaQuerySchema } from '@torres/shared';
import {
  ExportacaoLoteFontes,
  FonteExportacaoLoteBase,
  type ArquivoDoLote,
  type TabelaDoLote,
} from '../../../common/export/exportacao-lote.fontes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ContratosSalaService } from './contratos-sala.service';

/** Fonte da exportação em lote (issue #158): contratos de sala e os PDFs enviados. */
@Injectable()
export class ContratosSalaLoteFonte extends FonteExportacaoLoteBase {
  readonly entidade = 'contratos-sala' as const;

  constructor(
    registro: ExportacaoLoteFontes,
    private readonly contratos: ContratosSalaService,
    private readonly txHost: TransactionHost<PrismaAdapter>,
  ) {
    super(registro);
  }

  async tabelas(): Promise<TabelaDoLote[]> {
    const arquivo = await this.contratos.export(
      exportContratosSalaQuerySchema.parse({ format: 'csv' }),
    );
    return [{ nome: 'contratos-sala', arquivo }];
  }

  async arquivos(): Promise<ArquivoDoLote[]> {
    const contratos = await this.txHost.tx.contratoSala.findMany({
      where: { deletedAt: null, pdfArquivoId: { not: null } },
      select: { id: true, pdfArquivoId: true },
      orderBy: { createdAt: 'asc' },
    });
    return contratos.flatMap((c) =>
      c.pdfArquivoId ? [{ caminho: `contratos/${c.id}.pdf`, arquivoId: c.pdfArquivoId }] : [],
    );
  }
}
