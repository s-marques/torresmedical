import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  ATIVIDADE_STATUS_ROTULO,
  ATIVIDADE_TIPO_ROTULO,
  type Atividade,
  type AtividadeExportColumn,
  type AtividadeInput,
  type AtividadeNegocio,
  type AtividadeNegocioInput,
  type ExportAtividadesQuery,
  type LeadsSemFollowUpQuery,
  type ListAtividadesQuery,
  type Negocio,
  type ResumoAtividades,
  type ResumoAtividadesQuery,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { UsuariosService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import {
  INCLUDE as INCLUDE_NEGOCIO,
  instanteDaAtividade,
  NAO_EXCLUIDOS,
  NegociosService,
  toAtividadeNegocio,
  toNegocio,
} from '../pipeline/negocios.service';

export const INCLUDE = {
  negocio: { select: { titulo: true, status: true } },
} satisfies Prisma.AtividadeNegocioInclude;
type AtividadeCompleta = Prisma.AtividadeNegocioGetPayload<{ include: typeof INCLUDE }>;
type AtividadeRow = Prisma.AtividadeNegocioGetPayload<object>;

type Ordenacao = ListAtividadesQuery['sort'];
type FiltroLista = Pick<ListAtividadesQuery, 'search' | 'tipo' | 'status'>;

const PENDENTES = { status: 'PENDENTE', ...NAO_EXCLUIDOS } as const;

export const ATIVIDADE_EXPORT_DEFINITIONS: readonly ExportColumn<
  Atividade,
  AtividadeExportColumn
>[] = [
  { key: 'titulo', header: 'Título', value: (a) => a.titulo, width: 3 },
  { key: 'tipo', header: 'Tipo', value: (a) => ATIVIDADE_TIPO_ROTULO[a.tipo] },
  { key: 'negocio', header: 'Negócio', value: (a) => a.negocio, width: 3 },
  { key: 'dataHora', header: 'Data Agendamento', type: 'datetime', value: (a) => a.dataHora },
  { key: 'status', header: 'Status', value: (a) => ATIVIDADE_STATUS_ROTULO[a.status] },
  { key: 'responsavel', header: 'Responsável', value: (a) => a.responsavel, width: 2 },
  { key: 'descricao', header: 'Descrição', value: (a) => a.descricao, width: 4 },
];

function orderByDe(sort: Ordenacao): Prisma.AtividadeNegocioOrderByWithRelationInput[] {
  const d = sort.direction;
  const campos: Partial<
    Record<Ordenacao['field'], Prisma.AtividadeNegocioOrderByWithRelationInput>
  > = {
    titulo: { titulo: d },
    tipo: { tipo: d },
    negocio: { negocio: { titulo: d } },
    dataHora: { dataHora: d },
    status: { status: d },
  };
  // Empates (ex.: atividades sem negócio) seguem a data do agendamento.
  return [campos[sort.field] ?? { dataHora: d }, { dataHora: 'asc' }, { id: d }];
}

/** Nome vazio vai para o fim, em qualquer sentido. */
function compararNomes(a: string | null, b: string | null, direcao: 'asc' | 'desc'): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const ordem = a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
  return direcao === 'asc' ? ordem : -ordem;
}

/**
 * Atividades do CRM: tela Atividades (`/atividades`) e a próxima ação do Pipeline. Regra do
 * cliente (seção 23): negócio aberto não fica sem próxima ação, então a última atividade
 * pendente dele só é concluída ou cancelada depois de agendada a próxima (ou com o negócio
 * marcado como ganho/perdido).
 */
@Injectable()
export class AtividadesService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly negocios: NegociosService,
    private readonly usuarios: UsuariosService,
    private readonly exportService: ExportService,
  ) {}

  // ---------- Tela Atividades ----------

  async list(query: ListAtividadesQuery): Promise<Page<Atividade>> {
    const where = this.where(query);
    if (query.sort.field === 'responsavel') {
      const todos = await this.todosPorResponsavel(where, query.sort);
      const inicio = (query.page - 1) * query.pageSize;
      return {
        data: todos.slice(inicio, inicio + query.pageSize),
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total: todos.length,
          totalPages: Math.ceil(todos.length / query.pageSize),
        },
      };
    }
    const orderBy = orderByDe(query.sort);
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.atividadeNegocio.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.atividadeNegocio.count({ where }),
    });
    return { ...pagina, data: await this.paraDto(pagina.data) };
  }

  /** Cartões do cabeçalho: busca e tipo valem, o filtro de status não. */
  async resumo(query: ResumoAtividadesQuery): Promise<ResumoAtividades> {
    const grupos = await this.txHost.tx.atividadeNegocio.groupBy({
      by: ['status'],
      where: this.where({ ...query, status: undefined }),
      _count: { _all: true },
    });
    const de = (status: 'PENDENTE' | 'CONCLUIDA' | 'CANCELADA') =>
      grupos.find((g) => g.status === status)?._count._all ?? 0;
    const pendentes = de('PENDENTE');
    const concluidas = de('CONCLUIDA');
    const canceladas = de('CANCELADA');
    return { total: pendentes + concluidas + canceladas, pendentes, concluidas, canceladas };
  }

  async export(query: ExportAtividadesQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.atividadeNegocio.count({ where }));
    const rows =
      query.sort.field === 'responsavel'
        ? await this.todosPorResponsavel(where, query.sort)
        : await this.paraDto(
            await this.txHost.tx.atividadeNegocio.findMany({
              where,
              orderBy: orderByDe(query.sort),
              include: INCLUDE,
            }),
          );
    return this.exportService.export({
      format: query.format,
      title: 'Atividades',
      filename: 'atividades',
      columns: selectColumns(ATIVIDADE_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  async findById(id: string): Promise<Atividade> {
    return this.toDto(await this.buscar(id));
  }

  /** "Nova Atividade": com negócio, ele precisa estar aberto e empresta o responsável. */
  async create(input: AtividadeInput): Promise<Atividade> {
    const negocio = input.negocioId ? await this.negocios.buscarAberto(input.negocioId) : null;
    if (input.responsavelId) await this.usuarios.garantirAtivo(input.responsavelId, 'Responsável');
    const criada = await this.txHost.tx.atividadeNegocio.create({
      data: {
        ...this.dados(input),
        responsavelId: input.responsavelId ?? negocio?.responsavelId ?? null,
      },
      include: INCLUDE,
    });
    return this.toDto(criada);
  }

  /**
   * "Editar": o novo negócio precisa estar aberto, e a última atividade pendente de um negócio
   * aberto não pode sair dele.
   */
  async update(id: string, input: AtividadeInput): Promise<Atividade> {
    const atual = await this.buscar(id);
    const trocouNegocio = input.negocioId !== atual.negocioId;
    if (trocouNegocio) await this.garantirProximaAcao(atual);
    const negocio =
      trocouNegocio && input.negocioId ? await this.negocios.buscarAberto(input.negocioId) : null;
    if (input.responsavelId) await this.usuarios.garantirAtivo(input.responsavelId, 'Responsável');
    const alterada = await this.txHost.tx.atividadeNegocio.update({
      where: { id },
      data: {
        ...this.dados(input),
        responsavelId: input.responsavelId ?? negocio?.responsavelId ?? null,
      },
      include: INCLUDE,
    });
    return this.toDto(alterada);
  }

  /** Conclui a atividade pendente (no Pipeline: "Concluir próxima ação"). */
  async concluir(id: string): Promise<Atividade> {
    const atual = await this.buscarPendente(id);
    await this.garantirProximaAcao(atual);
    const concluida = await this.txHost.tx.atividadeNegocio.update({
      where: { id },
      data: { status: 'CONCLUIDA', concluidaEm: new Date() },
      include: INCLUDE,
    });
    return this.toDto(concluida);
  }

  async cancelar(id: string): Promise<Atividade> {
    const atual = await this.buscarPendente(id);
    await this.garantirProximaAcao(atual);
    const cancelada = await this.txHost.tx.atividadeNegocio.update({
      where: { id },
      data: { status: 'CANCELADA', canceladaEm: new Date() },
      include: INCLUDE,
    });
    return this.toDto(cancelada);
  }

  /** Exclusão lógica: histórico comercial. */
  async remove(id: string): Promise<Atividade> {
    await this.buscar(id);
    const excluida = await this.txHost.tx.atividadeNegocio.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: INCLUDE,
    });
    return this.toDto(excluida);
  }

  // ---------- Pipeline ----------

  /** "Agendar Follow-up": nova próxima ação. Sem responsável, herda o do negócio. */
  async agendarDoNegocio(
    negocioId: string,
    input: AtividadeNegocioInput,
  ): Promise<AtividadeNegocio> {
    const negocio = await this.negocios.buscarAberto(negocioId);
    if (input.responsavelId) await this.usuarios.garantirAtivo(input.responsavelId, 'Responsável');
    const criada = await this.txHost.tx.atividadeNegocio.create({
      data: {
        negocioId,
        tipo: input.tipo,
        titulo: input.titulo,
        dataHora: instanteDaAtividade(input.data, input.hora),
        responsavelId: input.responsavelId ?? negocio.responsavelId,
      },
    });
    const [usuarios, exige] = await Promise.all([
      this.usuarios.nomesPorIds(criada.responsavelId ? [criada.responsavelId] : []),
      this.exigeProximaAcao([{ ...criada, negocio: { status: 'ABERTO' } }]),
    ]);
    return toAtividadeNegocio(criada, usuarios, exige.has(criada.id));
  }

  /**
   * Leads sem follow-up: negócios abertos sem atividade pendente a partir de agora (nenhuma ou
   * só atrasadas). Lista para o painel e a central de tarefas do dia.
   */
  async leadsSemFollowUp(query: LeadsSemFollowUpQuery): Promise<Page<Negocio>> {
    const where: Prisma.NegocioWhereInput = {
      ...NAO_EXCLUIDOS,
      status: 'ABERTO',
      atividades: { none: { ...PENDENTES, dataHora: { gte: new Date() } } },
      ...(query.responsavelId ? { responsavelId: query.responsavelId } : {}),
      ...(await this.negocios.whereBusca(query.search)),
    };
    const d = query.sort.direction;
    const orderBy: Prisma.NegocioOrderByWithRelationInput[] = [
      query.sort.field === 'titulo' ? { titulo: d } : { createdAt: d },
      { id: d },
    ];
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.negocio.findMany({ where, orderBy, include: INCLUDE_NEGOCIO, ...p }),
      count: () => this.txHost.tx.negocio.count({ where }),
    });
    const nomes = await this.negocios.nomes(pagina.data);
    const agora = new Date();
    return { ...pagina, data: pagina.data.map((n) => toNegocio(n, nomes, agora)) };
  }

  // ---------- Apoio ----------

  private async buscar(id: string): Promise<AtividadeCompleta> {
    const atividade = isUuid(id)
      ? await this.txHost.tx.atividadeNegocio.findFirst({
          where: { id, ...NAO_EXCLUIDOS },
          include: INCLUDE,
        })
      : null;
    if (!atividade) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Atividade não encontrada', { status: 404 });
    }
    return atividade;
  }

  private async buscarPendente(id: string): Promise<AtividadeCompleta> {
    const atividade = await this.buscar(id);
    if (atividade.status === 'CONCLUIDA') {
      throw new BusinessException('ATIVIDADE_JA_CONCLUIDA', 'A atividade já foi concluída.');
    }
    if (atividade.status === 'CANCELADA') {
      throw new BusinessException('ATIVIDADE_JA_CANCELADA', 'A atividade já foi cancelada.');
    }
    return atividade;
  }

  /** Bloqueia fechar a última atividade pendente de um negócio aberto. */
  private async garantirProximaAcao(atividade: AtividadeCompleta): Promise<void> {
    if ((await this.exigeProximaAcao([atividade])).has(atividade.id)) {
      throw new BusinessException(
        'PROXIMA_ACAO_OBRIGATORIA',
        'Esta é a última atividade pendente do negócio. Agende a próxima atividade antes, ou marque o negócio como ganho ou perdido.',
      );
    }
  }

  /**
   * Ids das atividades que são a última pendente de um negócio aberto. Uma consulta agrupada
   * por negócio, só para as candidatas.
   */
  private async exigeProximaAcao(
    atividades: readonly (AtividadeRow & { negocio: { status: string } | null })[],
  ): Promise<Set<string>> {
    const candidatas = atividades.filter(
      (a) => a.status === 'PENDENTE' && a.negocioId && a.negocio?.status === 'ABERTO',
    );
    if (candidatas.length === 0) return new Set();
    const negocioIds = [...new Set(candidatas.map((a) => a.negocioId as string))];
    const grupos = await this.txHost.tx.atividadeNegocio.groupBy({
      by: ['negocioId'],
      where: { ...PENDENTES, negocioId: { in: negocioIds } },
      _count: { _all: true },
    });
    const unicas = new Set(grupos.filter((g) => g._count._all === 1).map((g) => g.negocioId));
    return new Set(candidatas.filter((a) => unicas.has(a.negocioId)).map((a) => a.id));
  }

  private where(query: FiltroLista): Prisma.AtividadeNegocioWhereInput {
    const busca = query.search;
    return {
      ...NAO_EXCLUIDOS,
      ...(query.tipo ? { tipo: query.tipo } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(busca
        ? {
            OR: [
              { titulo: { contains: busca, mode: 'insensitive' } },
              { descricao: { contains: busca, mode: 'insensitive' } },
              { negocio: { titulo: { contains: busca, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  private dados(input: AtividadeInput) {
    return {
      negocioId: input.negocioId,
      tipo: input.tipo,
      titulo: input.titulo,
      descricao: input.descricao,
      dataHora: instanteDaAtividade(input.data, input.hora),
    };
  }

  private async todosPorResponsavel(
    where: Prisma.AtividadeNegocioWhereInput,
    sort: Ordenacao,
  ): Promise<Atividade[]> {
    const dtos = await this.paraDto(
      await this.txHost.tx.atividadeNegocio.findMany({
        where,
        orderBy: [{ dataHora: 'asc' }, { id: 'asc' }],
        include: INCLUDE,
      }),
    );
    return dtos.sort((a, b) => compararNomes(a.responsavel, b.responsavel, sort.direction));
  }

  private async paraDto(linhas: readonly AtividadeCompleta[]): Promise<Atividade[]> {
    const [usuarios, exige] = await Promise.all([
      this.usuarios.nomesPorIds(linhas.flatMap((a) => (a.responsavelId ? [a.responsavelId] : []))),
      this.exigeProximaAcao(linhas),
    ]);
    return linhas.map((a) => ({
      ...toAtividadeNegocio(a, usuarios, exige.has(a.id)),
      negocio: a.negocio?.titulo ?? null,
      negocioStatus: a.negocio?.status ?? null,
      concluidaEm: a.concluidaEm?.toISOString() ?? null,
      canceladaEm: a.canceladaEm?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  private async toDto(atividade: AtividadeCompleta): Promise<Atividade> {
    const [dto] = await this.paraDto([atividade]);
    return dto as Atividade;
  }
}
