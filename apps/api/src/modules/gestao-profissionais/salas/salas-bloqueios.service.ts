import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  bloqueiosSobrepostos,
  descreverHorarioBloqueio,
  ocorrenciasBloqueio,
  SALA_BLOQUEIO_STATUS_ROTULOS,
  SALA_BLOQUEIO_TIPO_ROTULOS,
  type CancelarSalaBloqueioInput,
  type CreateSalaBloqueioInput,
  type ExportSalaBloqueiosQuery,
  type ListSalaBloqueiosQuery,
  type OcorrenciaBloqueio,
  type SalaBloqueio as SalaBloqueioDto,
  type SalaBloqueioExportColumn,
  type UpdateSalaBloqueioInput,
} from '@torres/shared';
import { CancelamentosService } from '../../../common/cancelamentos/cancelamentos.service';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import { isUuid } from '../../../common/auth/tokens';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { Prisma } from '../../../generated/prisma/client';
import { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import { ProfissionaisService } from '../profissionais/profissionais.service';

const INCLUDE = {
  sala: { select: { nome: true } },
  profissional: { select: { nome: true } },
  dias: { orderBy: { diaSemana: 'asc' } },
} satisfies Prisma.SalaBloqueioInclude;

type BloqueioComRelacoes = Prisma.SalaBloqueioGetPayload<{ include: typeof INCLUDE }>;

const ATIVO = { canceladoEm: null } as const;

const diaISO = (data: Date) => data.toISOString().slice(0, 10);
const paraData = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const formatarDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Período como na tabela: "10/12/2026" ou "10/12/2026 a 12/12/2026". */
export function descreverPeriodoBloqueio(b: Pick<SalaBloqueioDto, 'dataInicio' | 'dataFim'>) {
  return b.dataInicio === b.dataFim
    ? formatarDia(b.dataInicio)
    : `${formatarDia(b.dataInicio)} a ${formatarDia(b.dataFim)}`;
}

/** Colunas exportáveis, iguais às da tabela. */
export const SALA_BLOQUEIO_EXPORT_DEFINITIONS: readonly ExportColumn<
  SalaBloqueioDto,
  SalaBloqueioExportColumn
>[] = [
  { key: 'sala', header: 'Sala', value: (b) => b.salaNome, width: 2 },
  { key: 'tipo', header: 'Tipo', value: (b) => SALA_BLOQUEIO_TIPO_ROTULOS[b.tipo], width: 2 },
  { key: 'periodo', header: 'Período', value: (b) => descreverPeriodoBloqueio(b), width: 3 },
  { key: 'horario', header: 'Horário', value: (b) => descreverHorarioBloqueio(b), width: 4 },
  {
    key: 'profissional',
    header: 'Profissional',
    value: (b) => (b.oculto ? 'Ocupado' : (b.profissionalNome ?? '')),
    width: 3,
  },
  { key: 'motivo', header: 'Motivo', value: (b) => b.motivo ?? '', width: 4 },
  { key: 'responsavel', header: 'Responsável', value: (b) => b.criadoPorNome ?? '', width: 3 },
  { key: 'status', header: 'Status', value: (b) => SALA_BLOQUEIO_STATUS_ROTULOS[b.status] },
];

/** Um dia de bloqueio ativo, com o tipo e o profissional (Mapa de Ocupação e #136). */
export interface OcorrenciaBloqueioSala extends OcorrenciaBloqueio {
  bloqueio: SalaBloqueioDto;
}

/**
 * Bloqueios e reservas de sala (issue #138), aba Bloqueios da tela Salas. Exportado para a Agenda
 * (#136), que decide quais tipos impedem o agendamento.
 */
@Injectable()
export class SalasBloqueiosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly profissionais: ProfissionaisService,
    private readonly usuarios: UsuariosLookupService,
    private readonly exportService: ExportService,
    private readonly escopo: EscopoDadosService,
    private readonly contexto: RequestContextService,
    private readonly cancelamentos: CancelamentosService,
  ) {}

  async list(query: ListSalaBloqueiosQuery): Promise<Page<SalaBloqueioDto>> {
    const where = await this.where(query);
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.salaBloqueio.findMany({
          where,
          orderBy: toOrderBy(query.sort),
          include: INCLUDE,
          ...p,
        }),
      count: () => this.txHost.tx.salaBloqueio.count({ where }),
    });
    return { ...page, data: await this.toDtos(page.data) };
  }

  async export(query: ExportSalaBloqueiosQuery): Promise<ExportFile> {
    const where = await this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.salaBloqueio.count({ where }));
    const rows = await this.txHost.tx.salaBloqueio.findMany({
      where,
      orderBy: toOrderBy(query.sort),
      include: INCLUDE,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Bloqueios e reservas de salas',
      filename: 'bloqueios-salas',
      columns: selectColumns(SALA_BLOQUEIO_EXPORT_DEFINITIONS, query.columns),
      rows: await this.toDtos(rows),
    });
  }

  async findById(id: string): Promise<SalaBloqueioDto> {
    const bloqueio = await this.buscar(id);
    if (this.escopo.restrito()) {
      const visiveis = await this.salasVisiveis();
      const proprio =
        bloqueio.profissionalId !== null && this.escopo.permite(bloqueio.profissionalId);
      if (!proprio && !visiveis.includes(bloqueio.salaId)) throw semPermissao();
    }
    const [dto] = await this.toDtos([bloqueio]);
    return dto as SalaBloqueioDto;
  }

  /** Cria o bloqueio. Só a administração (usuário sem restrição de escopo) registra bloqueios. */
  async create(input: CreateSalaBloqueioInput): Promise<SalaBloqueioDto> {
    this.garantirAdministracao();
    await this.validar(input);
    await this.garantirSemConflito(input);
    const criado = await this.txHost.tx.salaBloqueio.create({
      data: {
        ...this.dados(input),
        criadoPorId: this.usuarioAtual(),
        dias: { create: input.dias },
      },
      include: INCLUDE,
    });
    const [dto] = await this.toDtos([criado]);
    return dto as SalaBloqueioDto;
  }

  /** Altera o bloqueio ativo (o cancelado é histórico e não muda). */
  async update(id: string, input: UpdateSalaBloqueioInput): Promise<SalaBloqueioDto> {
    this.garantirAdministracao();
    const atual = await this.buscar(id);
    this.garantirAtivo(atual);
    await this.validar(input);
    await this.garantirSemConflito(input, id);
    const alterado = await this.txHost.tx.salaBloqueio.update({
      where: { id },
      data: { ...this.dados(input), dias: { deleteMany: {}, create: input.dias } },
      include: INCLUDE,
    });
    const [dto] = await this.toDtos([alterado]);
    return dto as SalaBloqueioDto;
  }

  /** Cancela sem excluir: grava quem, quando e o motivo. */
  async cancelar(id: string, input: CancelarSalaBloqueioInput): Promise<SalaBloqueioDto> {
    this.garantirAdministracao();
    const atual = await this.buscar(id);
    this.garantirAtivo(atual);
    // O motivo da lista é obrigatório; o histórico geral guarda quem, quando e por quê (#162).
    const registro = await this.cancelamentos.registrar({
      tipo: 'PERIODO',
      entidade: 'SalaBloqueio',
      entidadeId: id,
      motivoId: input.motivoId,
      observacao: input.observacao,
      profissionalId: atual.profissionalId,
    });
    const cancelado = await this.txHost.tx.salaBloqueio.update({
      where: { id },
      data: {
        canceladoEm: new Date(),
        canceladoPorId: this.usuarioAtual(),
        motivoCancelamento: input.observacao ?? registro.motivo,
      },
      include: INCLUDE,
    });
    const [dto] = await this.toDtos([cancelado]);
    return dto as SalaBloqueioDto;
  }

  /**
   * Dias de bloqueio ativos em `[de, ate]` (`AAAA-MM-DD`), das salas não excluídas. Base do Mapa
   * de Ocupação e do Dashboard. Não aplica o escopo: quem chama já aplicou o seu (CLAUDE.md §6).
   */
  async ocorrenciasNoPeriodo(
    de: string,
    ate: string,
    salaIds?: readonly string[],
  ): Promise<OcorrenciaBloqueioSala[]> {
    const bloqueios = await this.txHost.tx.salaBloqueio.findMany({
      where: {
        ...ATIVO,
        sala: { deletedAt: null },
        salaId: salaIds ? { in: [...salaIds] } : undefined,
        dataInicio: { lte: paraData(ate) },
        dataFim: { gte: paraData(de) },
      },
      orderBy: [{ dataInicio: 'asc' }, { id: 'asc' }],
      include: INCLUDE,
    });
    const dtos = await this.toDtos(bloqueios);
    return dtos.flatMap((bloqueio) =>
      ocorrenciasBloqueio(bloqueio, de, ate).map((o) => ({ ...o, bloqueio })),
    );
  }

  /**
   * Bloqueios ativos da sala que têm horário em comum com `[inicio, fim)` no dia `data`
   * (`AAAA-MM-DD`, horas "HH:MM"). Para a regra de agendamento da #136.
   */
  async sobrepostosAoHorario(
    salaId: string,
    data: string,
    inicio: string,
    fim: string,
  ): Promise<SalaBloqueioDto[]> {
    const ocorrencias = await this.ocorrenciasNoPeriodo(data, data, [salaId]);
    return ocorrencias.filter((o) => o.inicio < fim && inicio < o.fim).map((o) => o.bloqueio);
  }

  // --- Regras ----------------------------------------------------------------------------

  /** Usuário restrito (issue #153) só consulta: criar, alterar e cancelar são da administração. */
  private garantirAdministracao(): void {
    if (this.escopo.restrito()) throw semPermissao();
  }

  private garantirAtivo(bloqueio: BloqueioComRelacoes): void {
    if (bloqueio.canceladoEm) {
      throw new BusinessException(
        'SALA_BLOQUEIO_CANCELADO',
        'Este bloqueio já foi cancelado e não pode ser alterado.',
        { status: 409 },
      );
    }
  }

  private async validar(input: CreateSalaBloqueioInput): Promise<void> {
    const sala = await this.txHost.tx.sala.count({ where: { id: input.salaId, deletedAt: null } });
    if (sala === 0) this.invalido('salaId', 'Sala inválida');
    if (input.profissionalId) {
      try {
        await this.profissionais.garantirExiste(input.profissionalId);
      } catch (erro) {
        if (erro instanceof BusinessException && erro.getStatus() === 404) {
          this.invalido('profissionalId', 'Profissional inválido');
        }
        throw erro;
      }
    }
  }

  /**
   * Dois bloqueios ativos da mesma sala não podem ter horário em comum (decisão do dev na #138).
   * A linha da sala fica travada até o fim da transação: duas gravações simultâneas na mesma
   * sala passam uma de cada vez e a segunda vê a primeira.
   */
  private async garantirSemConflito(input: CreateSalaBloqueioInput, ignorarId?: string) {
    await this.txHost.tx
      .$queryRaw`SELECT id FROM salas WHERE id = ${input.salaId}::uuid FOR UPDATE`;
    const candidatos = await this.txHost.tx.salaBloqueio.findMany({
      where: {
        ...ATIVO,
        salaId: input.salaId,
        id: ignorarId ? { not: ignorarId } : undefined,
        dataInicio: { lte: paraData(input.dataFim) },
        dataFim: { gte: paraData(input.dataInicio) },
      },
      orderBy: [{ dataInicio: 'asc' }, { id: 'asc' }],
      include: INCLUDE,
    });
    const conflito = candidatos.find((c) => bloqueiosSobrepostos(input, this.definicao(c)));
    if (conflito) {
      const definicao = this.definicao(conflito);
      const tipo = SALA_BLOQUEIO_TIPO_ROTULOS[conflito.tipo];
      const periodo = descreverPeriodoBloqueio(definicao);
      const horario = descreverHorarioBloqueio(definicao);
      throw new BusinessException(
        'SALA_BLOQUEIO_CONFLITO',
        `A sala ${conflito.sala.nome} já tem ${tipo.toLowerCase()} em ${periodo} (${horario}).`,
        { status: 409 },
      );
    }
  }

  private invalido(field: string, message: string): never {
    throw new BusinessException('SALA_BLOQUEIO_INVALIDO', message, {
      status: 400,
      details: [{ field, message }],
    });
  }

  private usuarioAtual(): string | null {
    const id = this.contexto.getUserId();
    return id && isUuid(id) ? id : null;
  }

  // --- Consultas -------------------------------------------------------------------------

  private async where(
    query: Pick<ListSalaBloqueiosQuery, 'status' | 'tipo' | 'salaId' | 'de' | 'ate'>,
  ): Promise<Prisma.SalaBloqueioWhereInput> {
    const where: Prisma.SalaBloqueioWhereInput = {
      sala: { deletedAt: null },
      salaId: query.salaId,
      tipo: query.tipo,
      canceladoEm: statusFiltro(query.status),
      dataInicio: query.ate ? { lte: paraData(query.ate) } : undefined,
      dataFim: query.de ? { gte: paraData(query.de) } : undefined,
    };
    if (!this.escopo.restrito()) return where;
    // Restrito vê os bloqueios das salas em que um profissional seu tem contrato e os dos seus
    // profissionais (decisão do dev na #138, igual ao Mapa de Ocupação).
    return {
      AND: [
        where,
        {
          OR: [
            { salaId: { in: await this.salasVisiveis() } },
            { profissionalId: this.escopo.filtroProfissional() },
          ],
        },
      ],
    };
  }

  /** Salas com contrato ativo de um profissional do escopo (usuário restrito). */
  private async salasVisiveis(): Promise<string[]> {
    const contratos = await this.txHost.tx.contratoSala.findMany({
      where: {
        deletedAt: null,
        status: 'ATIVO',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId: this.escopo.filtroProfissional(),
      },
      select: { salaId: true },
      distinct: ['salaId'],
    });
    return contratos.map((c) => c.salaId);
  }

  private async buscar(id: string): Promise<BloqueioComRelacoes> {
    const bloqueio = isUuid(id)
      ? await this.txHost.tx.salaBloqueio.findFirst({
          where: { id, sala: { deletedAt: null } },
          include: INCLUDE,
        })
      : null;
    if (!bloqueio) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Bloqueio não encontrado', { status: 404 });
    }
    return bloqueio;
  }

  private dados(input: CreateSalaBloqueioInput) {
    return {
      salaId: input.salaId,
      tipo: input.tipo,
      profissionalId: input.profissionalId,
      recorrente: input.recorrente,
      dataInicio: paraData(input.dataInicio),
      dataFim: paraData(input.dataFim),
      horaInicio: input.horaInicio,
      horaFim: input.horaFim,
      motivo: input.motivo,
    } satisfies Prisma.SalaBloqueioUncheckedCreateWithoutDiasInput;
  }

  private definicao(b: BloqueioComRelacoes) {
    return {
      recorrente: b.recorrente,
      dataInicio: diaISO(b.dataInicio),
      dataFim: diaISO(b.dataFim),
      horaInicio: b.horaInicio,
      horaFim: b.horaFim,
      dias: b.dias.map(({ diaSemana, inicio, fim }) => ({ diaSemana, inicio, fim })),
    };
  }

  private async toDtos(bloqueios: readonly BloqueioComRelacoes[]): Promise<SalaBloqueioDto[]> {
    const ids = bloqueios.flatMap((b) => [b.criadoPorId, b.canceladoPorId]);
    const usuarios = await this.usuarios.nomesPorIds(ids.filter((id) => id !== null));
    const nome = (id: string | null) => (id ? (usuarios.get(id) ?? null) : null);
    return bloqueios.map((b) => {
      const oculto =
        this.escopo.restrito() &&
        b.profissionalId !== null &&
        !this.escopo.permite(b.profissionalId);
      return {
        id: b.id,
        salaId: b.salaId,
        salaNome: b.sala.nome,
        tipo: b.tipo,
        status: b.canceladoEm ? 'CANCELADO' : 'ATIVO',
        ...this.definicao(b),
        profissionalId: oculto ? null : b.profissionalId,
        profissionalNome: oculto ? null : (b.profissional?.nome ?? null),
        motivo: oculto ? null : b.motivo,
        criadoPorId: oculto ? null : b.criadoPorId,
        criadoPorNome: oculto ? null : nome(b.criadoPorId),
        canceladoEm: b.canceladoEm ? b.canceladoEm.toISOString() : null,
        canceladoPorId: oculto ? null : b.canceladoPorId,
        canceladoPorNome: oculto ? null : nome(b.canceladoPorId),
        motivoCancelamento: oculto ? null : b.motivoCancelamento,
        oculto,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      };
    });
  }
}

function statusFiltro(status: ListSalaBloqueiosQuery['status']) {
  if (status === 'ATIVO') return null;
  if (status === 'CANCELADO') return { not: null };
  return undefined;
}
