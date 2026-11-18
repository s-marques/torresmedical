import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  MENSALIDADE_ROTULO_STATUS,
  podeMudarStatusMensalidade,
  type ExportMensalidadesQuery,
  type ListMensalidadesQuery,
  type Mensalidade,
  type MensalidadeExportColumn,
  type MensalidadeInput,
  type MensalidadeStatus,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { FormasPagamentoService } from '../../financeiro/formas-pagamento/formas-pagamento.service';
import { PacientesVinculadosService } from '../../consultorio-assistencial/pacientes-vinculados/pacientes-vinculados.service';
import { PacientesService } from '../pacientes/pacientes.service';

const INCLUDE = { paciente: { select: { nome: true } } } satisfies Prisma.MensalidadeInclude;
type MensalidadeCompleta = Prisma.MensalidadeGetPayload<{ include: typeof INCLUDE }>;

const NAO_EXCLUIDAS = { deletedAt: null } as const;

const paraData = (valor: string): Date => new Date(`${valor}T00:00:00Z`);
const deData = (valor: Date): string => valor.toISOString().slice(0, 10);

export function toMensalidade(m: MensalidadeCompleta): Mensalidade {
  return {
    id: m.id,
    pacienteId: m.pacienteId,
    cliente: m.paciente.nome,
    descricao: m.descricao,
    valor: m.valor.toString(),
    diaVencimento: m.diaVencimento,
    formaPagamentoId: m.formaPagamentoId,
    dataInicio: deData(m.dataInicio),
    dataFim: m.dataFim ? deData(m.dataFim) : null,
    observacoes: m.observacoes,
    status: m.status,
  };
}

/** Colunas exportáveis, iguais às do grid. */
export const MENSALIDADE_EXPORT_DEFINITIONS: readonly ExportColumn<
  Mensalidade,
  MensalidadeExportColumn
>[] = [
  { key: 'cliente', header: 'Cliente', value: (m) => m.cliente, width: 3 },
  { key: 'descricao', header: 'Descrição', value: (m) => m.descricao, width: 3 },
  { key: 'valor', header: 'Valor', type: 'currency', value: (m) => m.valor },
  { key: 'diaVencimento', header: 'Dia Venc.', type: 'number', value: (m) => m.diaVencimento },
  { key: 'dataInicio', header: 'Início', type: 'date', value: (m) => m.dataInicio },
  { key: 'dataFim', header: 'Fim', type: 'date', value: (m) => m.dataFim },
  { key: 'status', header: 'Status', value: (m) => MENSALIDADE_ROTULO_STATUS[m.status] },
];

/** Cobranças recorrentes mensais de pacientes (tela `/mensalidades`, issue #6). */
@Injectable()
export class MensalidadesService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly pacientes: PacientesService,
    private readonly formasPagamento: FormasPagamentoService,
    private readonly vinculados: PacientesVinculadosService,
  ) {}

  /** Escopo restrito (issue #153) vê só as mensalidades dos pacientes vinculados. */
  async list(query: ListMensalidadesQuery): Promise<Page<Mensalidade>> {
    const where = await this.where(query);
    const orderBy = this.orderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.mensalidade.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.mensalidade.count({ where }),
    });
    return { ...page, data: page.data.map(toMensalidade) };
  }

  async findById(id: string): Promise<Mensalidade> {
    return toMensalidade(await this.buscar(id));
  }

  async create(input: MensalidadeInput): Promise<Mensalidade> {
    await this.validarReferencias(input, null);
    const criada = await this.txHost.tx.mensalidade.create({
      data: this.dados(input),
      include: INCLUDE,
    });
    return toMensalidade(criada);
  }

  /** Editar: não vale para mensalidade cancelada (o cancelamento é final). */
  async update(id: string, input: MensalidadeInput): Promise<Mensalidade> {
    const atual = await this.buscar(id);
    if (atual.status === 'CANCELADO') {
      throw new BusinessException(
        'MENSALIDADE_CANCELADA',
        'Não é possível editar uma mensalidade cancelada.',
        { status: 422 },
      );
    }
    await this.validarReferencias(input, atual.formaPagamentoId);
    const atualizada = await this.txHost.tx.mensalidade.update({
      where: { id },
      data: this.dados(input),
      include: INCLUDE,
    });
    return toMensalidade(atualizada);
  }

  /** Botões Pausar, Reativar e Cancelar. Os títulos já gerados não são alterados. */
  async mudarStatus(id: string, status: MensalidadeStatus): Promise<Mensalidade> {
    const atual = await this.buscar(id);
    if (!podeMudarStatusMensalidade(atual.status, status)) {
      throw new BusinessException(
        'MENSALIDADE_STATUS_INVALIDO',
        `Não é possível mudar a mensalidade de ${MENSALIDADE_ROTULO_STATUS[atual.status]} para ${MENSALIDADE_ROTULO_STATUS[status]}.`,
        { status: 422 },
      );
    }
    const atualizada = await this.txHost.tx.mensalidade.update({
      where: { id },
      data: { status },
      include: INCLUDE,
    });
    return toMensalidade(atualizada);
  }

  async export(query: ExportMensalidadesQuery): Promise<ExportFile> {
    const where = await this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.mensalidade.count({ where }));
    const rows = await this.txHost.tx.mensalidade.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: INCLUDE,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Mensalidades',
      filename: 'mensalidades',
      columns: selectColumns(MENSALIDADE_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map(toMensalidade),
    });
  }

  /** Mensalidades ativas (não excluídas), para "Gerar Titulos do Mes". Sem escopo: quem chama já checou. */
  async ativas(): Promise<Mensalidade[]> {
    const rows = await this.txHost.tx.mensalidade.findMany({
      where: { ...NAO_EXCLUIDAS, status: 'ATIVO' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: INCLUDE,
    });
    return rows.map(toMensalidade);
  }

  private async buscar(id: string): Promise<MensalidadeCompleta> {
    const mensalidade = await this.txHost.tx.mensalidade.findFirst({
      where: { id, ...NAO_EXCLUIDAS },
      include: INCLUDE,
    });
    if (!mensalidade) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Mensalidade não encontrada', {
        status: 404,
      });
    }
    await this.vinculados.garantir(mensalidade.pacienteId);
    return mensalidade;
  }

  /**
   * Cliente precisa existir. A forma de pagamento precisa ser de recebimento e, quando escolhida
   * agora (diferente da atual), estar ativa.
   */
  private async validarReferencias(
    input: MensalidadeInput,
    formaPagamentoAtual: string | null,
  ): Promise<void> {
    await this.comoInvalido('pacienteId', 'Cliente inválido', () =>
      this.pacientes.findLookupById(input.pacienteId),
    );
    await this.vinculados.garantir(input.pacienteId);
    const formaId = input.formaPagamentoId;
    if (!formaId) return;
    const forma = await this.comoInvalido('formaPagamentoId', 'Forma de pagamento inválida', () =>
      this.formasPagamento.findById(formaId),
    );
    const mudou = formaId !== formaPagamentoAtual;
    if (forma.finalidade !== 'RECEBER' || (mudou && !forma.ativo)) {
      this.invalido('formaPagamentoId', 'Forma de pagamento inválida');
    }
  }

  /** Converte o 404 de uma referência em 400 no campo do formulário. */
  private async comoInvalido<T>(field: string, message: string, buscar: () => Promise<T>) {
    try {
      return await buscar();
    } catch (erro) {
      if (erro instanceof BusinessException && erro.getStatus() === 404) {
        this.invalido(field, message);
      }
      throw erro;
    }
  }

  private invalido(field: string, message: string): never {
    throw new BusinessException('MENSALIDADE_INVALIDA', message, {
      status: 400,
      details: [{ field, message }],
    });
  }

  private dados(input: MensalidadeInput) {
    return {
      pacienteId: input.pacienteId,
      descricao: input.descricao,
      valor: input.valor,
      diaVencimento: input.diaVencimento,
      formaPagamentoId: input.formaPagamentoId,
      dataInicio: paraData(input.dataInicio),
      dataFim: input.dataFim ? paraData(input.dataFim) : null,
      observacoes: input.observacoes,
    };
  }

  private async where(
    query: Pick<ListMensalidadesQuery, 'search' | 'status'>,
  ): Promise<Prisma.MensalidadeWhereInput> {
    const ids = await this.vinculados.idsNoEscopo();
    return {
      ...NAO_EXCLUIDAS,
      ...(ids !== null && { pacienteId: { in: ids } }),
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { descricao: { contains: query.search, mode: 'insensitive' } },
          { paciente: { nome: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };
  }

  private orderBy(
    sort: ListMensalidadesQuery['sort'],
  ): Prisma.MensalidadeOrderByWithRelationInput[] {
    const { field, direction } = sort;
    let principal: Prisma.MensalidadeOrderByWithRelationInput;
    if (field === 'cliente') principal = { paciente: { nome: direction } };
    else if (field === 'criacao') principal = { createdAt: direction };
    else principal = { [field]: direction };
    return [principal, { id: direction }];
  }
}
