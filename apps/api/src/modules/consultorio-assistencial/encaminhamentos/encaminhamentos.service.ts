import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  ENCAMINHAMENTO_SITUACAO_ROTULOS,
  type CreateEncaminhamentoInput,
  type Encaminhamento as EncaminhamentoDto,
  type EncaminhamentoExportColumn,
  type EncaminhamentoPage,
  type EncaminhamentoProfissionais,
  type EncaminhamentoRelatorioLinha,
  type EncaminhamentoRelatorioPage,
  type EncaminhamentoSituacao,
  type ExportEncaminhamentosQuery,
  type ListEncaminhamentosQuery,
  type RelatorioEncaminhamentosQuery,
  type UpdateEncaminhamentoInput,
} from '@torres/shared';
import type { Encaminhamento, Prisma } from '../../../generated/prisma/client';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import { ApiException, BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { inicioDoDia } from '../../../common/relatorios/periodo';
import { AgendamentosAtendimentoService } from '../../comercial-atendimento/agenda/agendamentos-atendimento.service';
import { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import { EspecialidadesService } from '../../gestao-profissionais/especialidades/especialidades.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { ContratosSalaService } from '../../gestao-profissionais/salas/contratos-sala.service';
import { PacientesVinculadosService } from '../pacientes-vinculados/pacientes-vinculados.service';
import { hojeNaClinica } from '../receituarios/prescricoes.service';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

export const ORIGEM_SEM_INDICACAO =
  'O profissional de origem não tem contrato ativo que permita indicação de pacientes';
export const DESTINO_SEM_INDICACAO =
  'O profissional de destino não tem contrato ativo que permita indicação de pacientes';

const dia = (data: Date) => data.toISOString().slice(0, 10);
const dataDoBanco = (data: string) => new Date(`${data}T00:00:00.000Z`);
const comparar = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
/** Percentual com uma casa; 0 quando não há encaminhamentos. */
const percentual = (parte: number, total: number) =>
  total === 0 ? 0 : Math.round((parte / total) * 1000) / 10;

/** Colunas exportáveis, iguais às do grid. */
export const ENCAMINHAMENTO_EXPORT_DEFINITIONS: readonly ExportColumn<
  EncaminhamentoDto,
  EncaminhamentoExportColumn
>[] = [
  { key: 'data', header: 'Data', type: 'date', value: (e) => e.data },
  { key: 'paciente', header: 'Paciente', value: (e) => e.pacienteNome ?? '', width: 3 },
  {
    key: 'origem',
    header: 'Encaminhado por',
    value: (e) => e.origemProfissionalNome ?? '',
    width: 3,
  },
  {
    key: 'destino',
    header: 'Encaminhado para',
    value: (e) => e.destinoProfissionalNome ?? '',
    width: 3,
  },
  {
    key: 'especialidade',
    header: 'Especialidade',
    value: (e) => e.especialidadeNome ?? '',
    width: 2,
  },
  {
    key: 'situacao',
    header: 'Situação',
    value: (e) => ENCAMINHAMENTO_SITUACAO_ROTULOS[e.situacao],
  },
];

type Filtros = Pick<
  ListEncaminhamentosQuery,
  'search' | 'situacao' | 'origemProfissionalId' | 'destinoProfissionalId' | 'de' | 'ate' | 'sort'
>;

/**
 * Encaminhamento de pacientes entre profissionais (tela `/encaminhamentos`, issue #146, R §26).
 * Decisões do dev na #146: origem e recepção registram; a situação é derivada de Agendamento e
 * Atendimento do paciente com o destino; só entram profissionais com contrato ativo que permite
 * indicação; o destino vê o paciente só pelo nome, sem conteúdo clínico (R §14).
 *
 * Quem tem escopo restrito (#153) vê os encaminhamentos em que um dos seus profissionais é
 * origem ou destino, mas só altera os de origem dele. Paciente, profissionais e especialidade
 * são de outros módulos, lidos pelos services exportados.
 *
 * A situação depende de dados de outros módulos, então filtro, ordenação e paginação por ela
 * acontecem em memória, depois do filtro de banco. O volume de encaminhamentos é pequeno.
 */
@Injectable()
export class EncaminhamentosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly pacientes: PacientesService,
    private readonly profissionais: ProfissionaisService,
    private readonly especialidades: EspecialidadesService,
    private readonly contratos: ContratosSalaService,
    private readonly agendamentos: AgendamentosAtendimentoService,
    private readonly pacientesVinculados: PacientesVinculadosService,
    private readonly escopo: EscopoDadosService,
  ) {}

  // -------------------------------------------------------------------------------------------
  // Listagem e detalhe

  async list(query: ListEncaminhamentosQuery): Promise<EncaminhamentoPage> {
    const todos = await this.buscarTodos(query);
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

  async findById(id: string): Promise<EncaminhamentoDto> {
    const registro = await this.buscar(id);
    if (!this.visivel(registro)) throw semPermissao();
    const [dto] = await this.paraDtos([registro]);
    return dto as EncaminhamentoDto;
  }

  /**
   * Selects do formulário: profissionais com contrato que permite indicação. As origens
   * respeitam o escopo do usuário (só os dele); os destinos trazem todos.
   */
  async profissionaisSelecionaveis(): Promise<EncaminhamentoProfissionais> {
    const ids = [...(await this.contratos.profissionaisQuePermitemIndicacao(hojeNaClinica()))];
    const nomes = await this.profissionais.nomesPorIds(ids);
    const itens = ids
      .map((id) => ({ id, label: nomes.get(id) ?? '', descricao: null }))
      .filter((item) => item.label !== '')
      .sort((a, b) => comparar(a.label, b.label));
    return { origens: itens.filter((item) => this.escopo.permite(item.id)), destinos: itens };
  }

  // -------------------------------------------------------------------------------------------
  // Escrita

  async create(input: CreateEncaminhamentoInput): Promise<EncaminhamentoDto> {
    await this.validar(input, null);
    const criado = await this.txHost.tx.encaminhamento.create({
      data: {
        pacienteId: input.pacienteId,
        origemProfissionalId: input.origemProfissionalId,
        destinoProfissionalId: input.destinoProfissionalId,
        especialidadeId: input.especialidadeId,
        data: dataDoBanco(input.data ?? hojeNaClinica()),
        motivo: input.motivo,
      },
    });
    return this.dto(criado);
  }

  async update(id: string, input: UpdateEncaminhamentoInput): Promise<EncaminhamentoDto> {
    const atual = await this.buscar(id);
    this.escopo.garantirProfissional(atual.origemProfissionalId);
    await this.validar(input, atual);
    const alterado = await this.txHost.tx.encaminhamento.update({
      where: { id },
      data: {
        pacienteId: input.pacienteId,
        origemProfissionalId: input.origemProfissionalId,
        destinoProfissionalId: input.destinoProfissionalId,
        especialidadeId: input.especialidadeId,
        data: input.data ? dataDoBanco(input.data) : atual.data,
        motivo: input.motivo,
      },
    });
    return this.dto(alterado);
  }

  /** Exclusão lógica. */
  async remove(id: string): Promise<EncaminhamentoDto> {
    const atual = await this.buscar(id);
    this.escopo.garantirProfissional(atual.origemProfissionalId);
    const excluido = await this.txHost.tx.encaminhamento.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return this.dto(excluido);
  }

  async export(query: ExportEncaminhamentosQuery): Promise<ExportFile> {
    const registros = await this.buscarTodos(query);
    this.exportService.ensureWithinLimit(registros.length);
    return this.exportService.export({
      format: query.format,
      title: 'Encaminhamentos de Pacientes',
      filename: 'encaminhamentos',
      columns: selectColumns(ENCAMINHAMENTO_EXPORT_DEFINITIONS, query.columns),
      rows: registros,
    });
  }

  // -------------------------------------------------------------------------------------------
  // Relatório por profissional

  /**
   * Encaminhamentos enviados e recebidos por profissional e quantos viraram atendimento. Uma
   * linha por profissional que enviou ou recebeu algum no período. Usuário restrito vê só as
   * linhas dos profissionais dele.
   */
  async relatorio(query: RelatorioEncaminhamentosQuery): Promise<EncaminhamentoRelatorioPage> {
    const encaminhamentos = await this.buscarTodos({
      de: query.de,
      ate: query.ate,
      search: undefined,
      situacao: undefined,
      origemProfissionalId: undefined,
      destinoProfissionalId: undefined,
      sort: { field: 'data', direction: 'asc' },
    });
    const linhas = new Map<
      string,
      { enviados: number; enviadosAtendidos: number; recebidos: number; recebidosAtendidos: number }
    >();
    const linha = (id: string) => {
      const atual = linhas.get(id) ?? {
        enviados: 0,
        enviadosAtendidos: 0,
        recebidos: 0,
        recebidosAtendidos: 0,
      };
      linhas.set(id, atual);
      return atual;
    };
    for (const e of encaminhamentos) {
      const atendido = e.situacao === 'ATENDIDO' ? 1 : 0;
      const origem = linha(e.origemProfissionalId);
      origem.enviados += 1;
      origem.enviadosAtendidos += atendido;
      const destino = linha(e.destinoProfissionalId);
      destino.recebidos += 1;
      destino.recebidosAtendidos += atendido;
    }
    const ids = [...linhas.keys()].filter((id) => this.escopo.permite(id));
    const nomes = await this.profissionais.nomesPorIds(ids);
    const todas: EncaminhamentoRelatorioLinha[] = ids.map((id) => {
      const c = linhas.get(id) as NonNullable<ReturnType<typeof linhas.get>>;
      return {
        profissionalId: id,
        profissionalNome: nomes.get(id) ?? null,
        ...c,
        taxaEnviados: percentual(c.enviadosAtendidos, c.enviados),
        taxaRecebidos: percentual(c.recebidosAtendidos, c.recebidos),
      };
    });
    const { field, direction } = query.sort;
    const sinal = direction === 'asc' ? 1 : -1;
    todas.sort((a, b) => {
      const principal =
        field === 'profissional'
          ? comparar(a.profissionalNome ?? '', b.profissionalNome ?? '')
          : a[field] - b[field];
      return (
        sinal * principal ||
        comparar(a.profissionalNome ?? '', b.profissionalNome ?? '') ||
        a.profissionalId.localeCompare(b.profissionalId)
      );
    });
    const inicio = (query.page - 1) * query.pageSize;
    return {
      data: todas.slice(inicio, inicio + query.pageSize),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: todas.length,
        totalPages: Math.ceil(todas.length / query.pageSize),
      },
    };
  }

  // -------------------------------------------------------------------------------------------
  // Internos

  private async buscar(id: string): Promise<Encaminhamento> {
    const registro = await this.txHost.tx.encaminhamento.findFirst({
      where: { id, ...NAO_EXCLUIDOS },
    });
    if (!registro) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'Encaminhamento não encontrado');
    }
    return registro;
  }

  /** O usuário vê o encaminhamento? Sem restrição, sempre; restrito, se origem ou destino é dele. */
  private visivel(registro: Encaminhamento): boolean {
    return (
      this.escopo.permite(registro.origemProfissionalId) ||
      this.escopo.permite(registro.destinoProfissionalId)
    );
  }

  private async dto(registro: Encaminhamento): Promise<EncaminhamentoDto> {
    const [dto] = await this.paraDtos([registro]);
    return dto as EncaminhamentoDto;
  }

  /**
   * Regras da escrita. A exigência de contrato com indicação vale para quem entra no
   * encaminhamento: na alteração, só para o profissional que mudou (um contrato que venceu
   * depois não impede ajustar o motivo de um encaminhamento antigo).
   */
  private async validar(
    input: CreateEncaminhamentoInput,
    atual: Encaminhamento | null,
  ): Promise<void> {
    await this.pacientes.findById(input.pacienteId);
    await Promise.all([
      this.profissionais.findById(input.origemProfissionalId),
      this.profissionais.findById(input.destinoProfissionalId),
    ]);
    if (input.especialidadeId) await this.especialidades.findById(input.especialidadeId);

    this.escopo.garantirProfissional(input.origemProfissionalId);
    if (input.pacienteId !== atual?.pacienteId) {
      await this.pacientesVinculados.garantir(input.pacienteId);
    }

    const permitidos = await this.contratos.profissionaisQuePermitemIndicacao(hojeNaClinica());
    if (
      input.origemProfissionalId !== atual?.origemProfissionalId &&
      !permitidos.has(input.origemProfissionalId)
    ) {
      throw new BusinessException('ORIGEM_SEM_INDICACAO', ORIGEM_SEM_INDICACAO);
    }
    if (
      input.destinoProfissionalId !== atual?.destinoProfissionalId &&
      !permitidos.has(input.destinoProfissionalId)
    ) {
      throw new BusinessException('DESTINO_SEM_INDICACAO', DESTINO_SEM_INDICACAO);
    }
  }

  /** Todos os encaminhamentos que passam nos filtros, já como DTO, na ordem pedida. */
  private async buscarTodos(query: Filtros): Promise<EncaminhamentoDto[]> {
    const registros = await this.txHost.tx.encaminhamento.findMany({
      where: await this.where(query),
    });
    const dtos = (await this.paraDtos(registros)).filter(
      (e) => !query.situacao || e.situacao === query.situacao,
    );
    const { field, direction } = query.sort;
    const sinal = direction === 'asc' ? 1 : -1;
    const chave = (e: EncaminhamentoDto): string => {
      switch (field) {
        case 'data':
          return e.data;
        case 'paciente':
          return e.pacienteNome ?? '';
        case 'origem':
          return e.origemProfissionalNome ?? '';
        case 'destino':
          return e.destinoProfissionalNome ?? '';
        case 'especialidade':
          return e.especialidadeNome ?? '';
        case 'situacao':
          return e.situacao;
      }
    };
    return dtos.sort(
      (a, b) =>
        sinal * comparar(chave(a), chave(b)) ||
        sinal * a.createdAt.localeCompare(b.createdAt) ||
        sinal * a.id.localeCompare(b.id),
    );
  }

  /** Filtros de banco e escopo; a busca olha motivo e os nomes de paciente e profissionais. */
  private async where(query: Filtros): Promise<Prisma.EncaminhamentoWhereInput> {
    const and: Prisma.EncaminhamentoWhereInput[] = [];
    const ids = this.escopo.profissionalIds();
    if (ids) {
      and.push({
        OR: [
          { origemProfissionalId: { in: [...ids] } },
          { destinoProfissionalId: { in: [...ids] } },
        ],
      });
    }
    if (query.search) {
      const [pacienteIds, profissionalIds] = await Promise.all([
        this.pacientes.idsPorBusca(query.search),
        this.profissionais.idsPorBusca(query.search),
      ]);
      and.push({
        OR: [
          { motivo: { contains: query.search, mode: 'insensitive' } },
          ...(pacienteIds.length > 0 ? [{ pacienteId: { in: pacienteIds } }] : []),
          ...(profissionalIds.length > 0
            ? [
                { origemProfissionalId: { in: profissionalIds } },
                { destinoProfissionalId: { in: profissionalIds } },
              ]
            : []),
        ],
      });
    }
    return {
      ...NAO_EXCLUIDOS,
      ...(query.origemProfissionalId && { origemProfissionalId: query.origemProfissionalId }),
      ...(query.destinoProfissionalId && { destinoProfissionalId: query.destinoProfissionalId }),
      ...((query.de || query.ate) && {
        data: {
          ...(query.de && { gte: dataDoBanco(query.de) }),
          ...(query.ate && { lte: dataDoBanco(query.ate) }),
        },
      }),
      ...(and.length > 0 && { AND: and }),
    };
  }

  private async paraDtos(registros: readonly Encaminhamento[]): Promise<EncaminhamentoDto[]> {
    if (registros.length === 0) return [];
    const profissionalIds = registros.flatMap((r) => [
      r.origemProfissionalId,
      r.destinoProfissionalId,
    ]);
    const especialidadeIds = [
      ...new Set(registros.flatMap((r) => (r.especialidadeId ? [r.especialidadeId] : []))),
    ];
    const [pacientes, profissionais, especialidades, situacoes] = await Promise.all([
      this.pacientes.nomesPorIds(registros.map((r) => r.pacienteId)),
      this.profissionais.nomesPorIds(profissionalIds),
      this.nomesEspecialidades(especialidadeIds),
      this.situacoes(registros),
    ]);
    return registros.map((r) => ({
      id: r.id,
      pacienteId: r.pacienteId,
      pacienteNome: pacientes.get(r.pacienteId) ?? null,
      origemProfissionalId: r.origemProfissionalId,
      origemProfissionalNome: profissionais.get(r.origemProfissionalId) ?? null,
      destinoProfissionalId: r.destinoProfissionalId,
      destinoProfissionalNome: profissionais.get(r.destinoProfissionalId) ?? null,
      especialidadeId: r.especialidadeId,
      especialidadeNome: r.especialidadeId ? (especialidades.get(r.especialidadeId) ?? null) : null,
      data: dia(r.data),
      motivo: r.motivo,
      situacao: situacoes.get(r.id) ?? 'ENCAMINHADO',
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  private async nomesEspecialidades(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const itens = await Promise.all(
      ids.map(async (id): Promise<[string, string] | null> => {
        try {
          return [id, (await this.especialidades.findLookupById(id)).label];
        } catch {
          // Especialidade excluída depois do encaminhamento: o nome some, o registro fica.
          return null;
        }
      }),
    );
    return new Map(itens.filter((item): item is [string, string] => item !== null));
  }

  /**
   * Situação derivada (decisão do dev na #146). Conta o que aconteceu com o profissional de
   * destino a partir do início do dia do encaminhamento: atendimento finalizado (ou agendamento
   * já atendido) = ATENDIDO; agendamento ativo = AGENDADO; senão ENCAMINHADO.
   */
  private async situacoes(
    registros: readonly Encaminhamento[],
  ): Promise<ReadonlyMap<string, EncaminhamentoSituacao>> {
    const pacienteIds = [...new Set(registros.map((r) => r.pacienteId))];
    const destinoIds = [...new Set(registros.map((r) => r.destinoProfissionalId))];
    const [atendimentos, agendamentos] = await Promise.all([
      this.txHost.tx.atendimento.findMany({
        where: {
          ...NAO_EXCLUIDOS,
          status: 'FINALIZADO',
          finalizadoEm: { not: null },
          pacienteId: { in: pacienteIds },
          profissionalId: { in: destinoIds },
        },
        select: { pacienteId: true, profissionalId: true, finalizadoEm: true },
      }),
      this.agendamentos.agendamentosDosPares(pacienteIds, destinoIds),
    ]);
    const situacoes = new Map<string, EncaminhamentoSituacao>();
    for (const r of registros) {
      const desde = inicioDoDia(dia(r.data)).getTime();
      const doPar = <T extends { pacienteId: string; profissionalId: string }>(item: T) =>
        item.pacienteId === r.pacienteId && item.profissionalId === r.destinoProfissionalId;
      const atendimento = atendimentos.some(
        (a) => doPar(a) && a.finalizadoEm !== null && a.finalizadoEm.getTime() >= desde,
      );
      const agendamentosDepois = agendamentos.filter(
        (a) => doPar(a) && a.inicio.getTime() >= desde,
      );
      if (atendimento || agendamentosDepois.some((a) => a.atendido)) {
        situacoes.set(r.id, 'ATENDIDO');
      } else if (agendamentosDepois.length > 0) {
        situacoes.set(r.id, 'AGENDADO');
      } else {
        situacoes.set(r.id, 'ENCAMINHADO');
      }
    }
    return situacoes;
  }
}
