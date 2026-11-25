import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { Agendamento } from '../../../generated/prisma/client';
import {
  ExportacaoLoteFontes,
  FonteExportacaoLoteBase,
  type TabelaDoLote,
} from '../../../common/export/exportacao-lote.fontes';
import { ExportService } from '../../../common/export/export.service';
import type { ExportColumn } from '../../../common/export/export.types';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** Colunas do CSV de agendamentos: ids para cruzar com `pacientes.csv` e `profissionais.csv`. */
export const AGENDAMENTO_LOTE_COLUNAS: readonly ExportColumn<Agendamento>[] = [
  { key: 'numero', header: 'Número', type: 'number', value: (a) => a.numero },
  { key: 'inicio', header: 'Início', type: 'datetime', value: (a) => a.inicio },
  {
    key: 'duracaoMinutos',
    header: 'Duração (min)',
    type: 'number',
    value: (a) => a.duracaoMinutos,
  },
  { key: 'status', header: 'Status', value: (a) => a.status },
  { key: 'pacienteId', header: 'Paciente (id)', value: (a) => a.pacienteId },
  { key: 'profissionalId', header: 'Profissional (id)', value: (a) => a.profissionalId },
  { key: 'salaId', header: 'Sala (id)', value: (a) => a.salaId },
  { key: 'tipoAgendamentoId', header: 'Tipo (id)', value: (a) => a.tipoAgendamentoId },
  { key: 'valor', header: 'Valor', type: 'currency', value: (a) => a.valor },
  { key: 'convenio', header: 'Convênio', type: 'boolean', value: (a) => a.convenio },
  { key: 'pagoEm', header: 'Pago em', type: 'datetime', value: (a) => a.pagoEm },
  { key: 'observacoes', header: 'Observações', value: (a) => a.observacoes },
  { key: 'createdAt', header: 'Criado em', type: 'datetime', value: (a) => a.createdAt },
];

/** Fonte da exportação em lote (issue #158): todos os agendamentos, sem os excluídos. */
@Injectable()
export class AgendamentosLoteFonte extends FonteExportacaoLoteBase {
  readonly entidade = 'agendamentos' as const;

  constructor(
    registro: ExportacaoLoteFontes,
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {
    super(registro);
  }

  async tabelas(): Promise<TabelaDoLote[]> {
    const rows = await this.txHost.tx.agendamento.findMany({
      where: { deletedAt: null },
      orderBy: [{ inicio: 'asc' }, { numero: 'asc' }],
    });
    const arquivo = await this.exportService.export({
      format: 'csv',
      title: 'Agendamentos',
      filename: 'agendamentos',
      columns: AGENDAMENTO_LOTE_COLUNAS,
      rows,
    });
    return [{ nome: 'agendamentos', arquivo }];
  }
}
