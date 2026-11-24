import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  PACIENTE_TIPO_ROTULOS,
  type CreatePacienteInput,
  type ExportPacientesQuery,
  type ListPacientesQuery,
  type LookupItem,
  type LookupQuery,
  type Paciente as PacienteDto,
  type PacienteExportColumn,
  type PacienteResumo,
  type UpdatePacienteInput,
} from '@torres/shared';
import type { Paciente, Prisma } from '../../../generated/prisma/client';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { EntidadeLookupService, type FonteLookup } from '../../../common/lookups/lookup-query';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { intervaloDoPeriodo } from '../../../common/relatorios/periodo';
import { EspecialidadesService } from '../../gestao-profissionais/especialidades/especialidades.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { ConsentimentosPacienteService } from './consentimentos-paciente.service';
import { mascararCpf } from './mascarar-cpf';
import { PacientesDuplicidadeService } from './pacientes-duplicidade.service';
import { PacientesVinculadosService } from '../../consultorio-assistencial/pacientes-vinculados/pacientes-vinculados.service';

const CPF_DIGITOS = 11;
const NAO_EXCLUIDOS = { deletedAt: null } as const;
const COM_ORIGEM = { origemCliente: { select: { nome: true } } } as const;

type PacienteComOrigem = Paciente & { origemCliente: { nome: string } | null };

const DIA_MS = 86_400_000;
/** Agendamento que ainda pode acontecer: fora os cancelados, as faltas, os atendidos e os a reagendar. */
const STATUS_FORA_DO_RETORNO = ['CANCELADO', 'REAGENDAR', 'FALTOU', 'ATENDIDO'] as const;

/** Filtros da listagem e da exportação (a ordenação e a paginação ficam de fora). */
type FiltrosPacientes = Pick<
  ListPacientesQuery,
  | 'search'
  | 'status'
  | 'origemClienteId'
  | 'canalOrigem'
  | 'semRetornoDias'
  | 'comFaltas'
  | 'novosDe'
  | 'novosAte'
>;

/** Nomes resolvidos nos módulos donos (profissional, especialidade, quem indicou). */
export interface NomesPaciente {
  indicacao?: string | null;
  profissionalVinculo?: string | null;
  especialidadeVinculo?: string | null;
}

/** CPF (`052.228.731-02`) ou CNPJ (`00.000.000/0000-00`) a partir dos dígitos gravados. */
export function formatarDocumento(documento: string | null): string | null {
  if (documento?.length === CPF_DIGITOS) {
    return `${documento.slice(0, 3)}.${documento.slice(3, 6)}.${documento.slice(6, 9)}-${documento.slice(9)}`;
  }
  if (documento?.length === 14) {
    return `${documento.slice(0, 2)}.${documento.slice(2, 5)}.${documento.slice(5, 8)}/${documento.slice(8, 12)}-${documento.slice(12)}`;
  }
  return documento;
}

/** Resposta da API: a data de nascimento vira `AAAA-MM-DD` e a origem traz o nome. */
export function toPacienteDto(
  { origemCliente, deletedAt: _deletedAt, ...p }: PacienteComOrigem,
  nomes: NomesPaciente = {},
): PacienteDto {
  return {
    ...p,
    dataNascimento: p.dataNascimento?.toISOString().slice(0, 10) ?? null,
    origemNome: origemCliente?.nome ?? null,
    indicacaoNome: p.indicacaoTipo === 'TEXTO' ? p.indicacaoTexto : (nomes.indicacao ?? null),
    profissionalVinculoNome: nomes.profissionalVinculo ?? null,
    especialidadeVinculoNome: nomes.especialidadeVinculo ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Colunas exportáveis, iguais às do grid. */
export const PACIENTE_EXPORT_DEFINITIONS: readonly ExportColumn<
  PacienteComOrigem,
  PacienteExportColumn
>[] = [
  { key: 'nome', header: 'Nome', value: (p) => p.nome, width: 3 },
  {
    key: 'documento',
    header: 'Documento',
    value: (p) => formatarDocumento(p.documento),
    width: 2,
  },
  { key: 'telefone', header: 'Telefone', value: (p) => p.celular ?? p.telefone, width: 2 },
  { key: 'email', header: 'Email', value: (p) => p.email, width: 3 },
  { key: 'origem', header: 'Origem', value: (p) => p.origemCliente?.nome },
  { key: 'status', header: 'Status', value: (p) => STATUS_ROTULO[p.status] },
];

const STATUS_ROTULO = { NOVO: 'Novo', ATIVO: 'Ativo', INATIVO: 'Inativo' } as const;

export { mascararCpf };

/** Busca do combobox: nome ou dígitos do CPF (aceita `123.456` ou `123456`). */
function buscaPaciente(search: string | undefined): Prisma.PacienteWhereInput {
  if (!search) return {};
  const digitos = search.replaceAll(/\D/g, '');
  const nome: Prisma.PacienteWhereInput = { nome: { contains: search, mode: 'insensitive' } };
  return { OR: digitos ? [nome, { documento: { contains: digitos } }] : [nome] };
}

/** Busca da tela Pacientes: nome, email e dígitos de CPF/CNPJ, telefone e celular. */
function buscaLista(search: string | undefined): Prisma.PacienteWhereInput {
  if (!search) return {};
  const digitos = search.replaceAll(/\D/g, '');
  const porDigitos = digitos
    ? [
        { documento: { contains: digitos } },
        { telefone: { contains: digitos } },
        { celular: { contains: digitos } },
      ]
    : [];
  return {
    OR: [
      { nome: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      ...porDigitos,
    ],
  };
}

/** Paciente/Cliente: entidade do módulo Comercial / Atendimento, usada por várias telas. */
@Injectable()
export class PacientesService extends EntidadeLookupService<
  LookupQuery<'pacientes'>,
  Prisma.PacienteWhereInput,
  Paciente
> {
  protected readonly naoEncontrado = 'Paciente não encontrado';
  protected readonly fonte: FonteLookup<Prisma.PacienteWhereInput, Paciente> = {
    findMany: (args) => this.txHost.tx.paciente.findMany(args),
    count: (args) => this.txHost.tx.paciente.count(args),
    findFirst: (args) => this.txHost.tx.paciente.findFirst(args),
  };

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly vinculados: PacientesVinculadosService,
    private readonly escopo: EscopoDadosService,
    private readonly profissionais: ProfissionaisService,
    private readonly especialidades: EspecialidadesService,
    private readonly consentimentos: ConsentimentosPacienteService,
    private readonly duplicidade: PacientesDuplicidadeService,
  ) {
    super();
  }

  /**
   * Tela Pacientes: busca, status e ordenação (a origem ordena pelo nome dela). Usuário com
   * escopo restrito vê só os pacientes vinculados aos seus profissionais (issue #153).
   */
  async list(query: ListPacientesQuery): Promise<Page<PacienteResumo>> {
    const where = await this.whereNoEscopo(query);
    const orderBy = this.orderBy(query.sort);
    return paginate(query, {
      findMany: async (page) =>
        this.resumos(
          await this.txHost.tx.paciente.findMany({ where, orderBy, include: COM_ORIGEM, ...page }),
        ),
      count: () => this.txHost.tx.paciente.count({ where }),
    });
  }

  /**
   * Detalhe para outros módulos, sem o escopo: quem chama já aplicou o seu (ex.: o agendamento do
   * Atendimento Médico). A tela Pacientes usa `detalheNoEscopo`.
   */
  async detalhe(id: string): Promise<PacienteDto> {
    return (await this.dtos([await this.buscarComOrigem(id)]))[0]!;
  }

  /**
   * `GET /pacientes/:id`: 404 se não existe; 403 se não está vinculado ao usuário restrito.
   * Traz também os dados calculados de atendimento e retorno.
   */
  async detalheNoEscopo(id: string): Promise<PacienteResumo> {
    const paciente = await this.buscarComOrigem(id);
    await this.vinculados.garantir(id);
    return (await this.resumos([paciente]))[0]!;
  }

  async create(input: CreatePacienteInput): Promise<PacienteDto> {
    await this.validar(input);
    this.garantirVinculoNoEscopo(input.profissionalVinculoId);
    const candidatos = await this.duplicidade.exigirConfirmacao(input, input.duplicidadeConfirmada);
    const criado = await this.txHost.tx.paciente.create({
      data: this.dados(input),
      include: COM_ORIGEM,
    });
    await this.duplicidade.registrarConfirmacao(criado.id, candidatos);
    return this.aposConsentimentos(criado.id, input);
  }

  async update(id: string, input: UpdatePacienteInput): Promise<PacienteDto> {
    const atual = await this.findById(id);
    await this.vinculados.garantir(id);
    await this.validar(input, id);
    if (input.profissionalVinculoId !== atual.profissionalVinculoId) {
      this.garantirVinculoNoEscopo(input.profissionalVinculoId);
    }
    const candidatos = await this.duplicidade.exigirConfirmacao(
      input,
      input.duplicidadeConfirmada,
      id,
    );
    await this.txHost.tx.paciente.update({ where: { id }, data: this.dados(input) });
    await this.duplicidade.registrarConfirmacao(id, candidatos);
    return this.aposConsentimentos(id, input);
  }

  /** Exclusão lógica: o histórico clínico e financeiro continua apontando para o paciente. */
  async remove(id: string): Promise<PacienteDto> {
    await this.findById(id);
    await this.vinculados.garantir(id);
    const excluido = await this.txHost.tx.paciente.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: COM_ORIGEM,
    });
    return (await this.dtos([excluido]))[0]!;
  }

  async export(query: ExportPacientesQuery): Promise<ExportFile> {
    const where = await this.whereNoEscopo(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.paciente.count({ where }));
    const rows = await this.txHost.tx.paciente.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: COM_ORIGEM,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Pacientes',
      filename: 'pacientes',
      columns: selectColumns(PACIENTE_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  /** Nome dos pacientes não excluídos entre os ids (cartões do CRM). */
  async nomesPorIds(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (ids.length === 0) return new Map();
    const pacientes = await this.txHost.tx.paciente.findMany({
      where: { id: { in: [...new Set(ids)] }, ...NAO_EXCLUIDOS },
      select: { id: true, nome: true },
    });
    return new Map(pacientes.map((p) => [p.id, p.nome]));
  }

  /** Ids dos pacientes que casam com a busca da tela Pacientes (nome, tel, CPF, CNPJ). */
  async idsPorBusca(search: string, limite = 500): Promise<string[]> {
    const pacientes = await this.txHost.tx.paciente.findMany({
      where: { ...NAO_EXCLUIDOS, ...buscaLista(search) },
      select: { id: true },
      take: limite,
    });
    return pacientes.map((p) => p.id);
  }

  /**
   * Filtros do relacionamento (issue #148). "Sem retorno há N dias": já foi atendido, o último
   * atendimento foi há mais de N dias e não há nada agendado à frente. "Novos": cadastrados no
   * período, em dias inteiros do fuso da clínica.
   */
  private where(query: FiltrosPacientes, agora = new Date()): Prisma.PacienteWhereInput {
    const e: Prisma.PacienteWhereInput[] = [];
    if (query.semRetornoDias) {
      const limite = new Date(agora.getTime() - query.semRetornoDias * DIA_MS);
      e.push({
        agendamentos: {
          some: { status: 'ATENDIDO', deletedAt: null },
          none: {
            deletedAt: null,
            OR: [
              { status: 'ATENDIDO', inicio: { gte: limite } },
              { inicio: { gte: agora }, status: { notIn: [...STATUS_FORA_DO_RETORNO] } },
            ],
          },
        },
      });
    }
    if (query.comFaltas) {
      e.push({ agendamentos: { some: { status: 'FALTOU', deletedAt: null } } });
    }
    const periodo =
      query.novosDe || query.novosAte
        ? {
            gte: query.novosDe ? intervaloDoPeriodo(query.novosDe, query.novosDe).gte : undefined,
            lt: query.novosAte ? intervaloDoPeriodo(query.novosAte, query.novosAte).lt : undefined,
          }
        : undefined;
    return {
      ...NAO_EXCLUIDOS,
      status: query.status,
      origemClienteId: query.origemClienteId,
      canalOrigem: query.canalOrigem,
      createdAt: periodo,
      ...buscaLista(query.search),
      ...(e.length > 0 ? { AND: e } : {}),
    };
  }

  /** Filtros da lista e da exportação, limitados aos pacientes vinculados quando restrito. */
  private async whereNoEscopo(query: FiltrosPacientes): Promise<Prisma.PacienteWhereInput> {
    const ids = await this.vinculados.idsNoEscopo();
    const where = this.where(query);
    return ids === null ? where : { AND: [where, { id: { in: ids } }] };
  }

  private orderBy(sort: ListPacientesQuery['sort']): Prisma.PacienteOrderByWithRelationInput[] {
    const direcao = sort.direction;
    const campo: Prisma.PacienteOrderByWithRelationInput =
      sort.field === 'origem'
        ? { origemCliente: { nome: direcao } }
        : { [sort.field === 'telefone' ? 'celular' : sort.field]: direcao };
    return [campo, { id: direcao }];
  }

  private async buscarComOrigem(id: string): Promise<PacienteComOrigem> {
    const paciente = isUuid(id)
      ? await this.txHost.tx.paciente.findFirst({
          where: { id, ...NAO_EXCLUIDOS },
          include: COM_ORIGEM,
        })
      : null;
    if (!paciente) {
      throw new BusinessException(ErrorCode.NOT_FOUND, this.naoEncontrado, { status: 404 });
    }
    return paciente;
  }

  /** O profissional de vínculo precisa estar no escopo de quem grava (usuário restrito, #153). */
  private garantirVinculoNoEscopo(profissionalId: string | null): void {
    if (profissionalId) this.escopo.garantirProfissional(profissionalId);
  }

  /**
   * Os consentimentos viram registros no histórico (só quando mudam) e atualizam os espelhos do
   * cadastro; a resposta já traz o valor vigente.
   */
  private async aposConsentimentos(id: string, input: CreatePacienteInput): Promise<PacienteDto> {
    for (const consentimento of input.consentimentos ?? []) {
      await this.consentimentos.registrarSeMudou(id, consentimento);
    }
    if (input.aceitaCampanhasWhatsapp !== undefined) {
      await this.consentimentos.registrarSeMudou(id, {
        tipo: 'CAMPANHAS',
        aceito: input.aceitaCampanhasWhatsapp,
        canal: 'OUTRO',
        observacao: null,
      });
    }
    return (await this.dtos([await this.buscarComOrigem(id)]))[0]!;
  }

  /** Cadastros com os nomes de quem indicou, do profissional e da especialidade de vínculo. */
  private async dtos(rows: readonly PacienteComOrigem[]): Promise<PacienteDto[]> {
    const referencias = (tipo: 'PACIENTE' | 'PROFISSIONAL') =>
      rows.flatMap((r) =>
        r.indicacaoTipo === tipo && r.indicacaoReferenciaId ? [r.indicacaoReferenciaId] : [],
      );
    const [pacientes, profissionais, especialidades] = await Promise.all([
      this.nomesPorIds(referencias('PACIENTE')),
      this.profissionais.nomesPorIds([
        ...referencias('PROFISSIONAL'),
        ...rows.flatMap((r) => (r.profissionalVinculoId ? [r.profissionalVinculoId] : [])),
      ]),
      this.especialidades.nomesPorIds(
        rows.flatMap((r) => (r.especialidadeVinculoId ? [r.especialidadeVinculoId] : [])),
      ),
    ]);
    return rows.map((r) => {
      const origemIndicacao = r.indicacaoTipo === 'PACIENTE' ? pacientes : profissionais;
      return toPacienteDto(r, {
        indicacao: r.indicacaoReferenciaId ? origemIndicacao.get(r.indicacaoReferenciaId) : null,
        profissionalVinculo: r.profissionalVinculoId
          ? profissionais.get(r.profissionalVinculoId)
          : null,
        especialidadeVinculo: r.especialidadeVinculoId
          ? especialidades.get(r.especialidadeVinculoId)
          : null,
      });
    });
  }

  /**
   * Adiciona os dados calculados dos agendamentos: primeiro e último atendimento (`ATENDIDO`),
   * próximo retorno (agendamento futuro ainda válido) e número de faltas.
   */
  private async resumos(rows: readonly PacienteComOrigem[]): Promise<PacienteResumo[]> {
    const dtos = await this.dtos(rows);
    if (rows.length === 0) return [];
    const pacienteId = { in: rows.map((r) => r.id) };
    const base = { pacienteId, deletedAt: null };
    const [atendidos, faltas, futuros] = await Promise.all([
      this.txHost.tx.agendamento.groupBy({
        by: ['pacienteId'],
        where: { ...base, status: 'ATENDIDO' },
        _min: { inicio: true },
        _max: { inicio: true },
      }),
      this.txHost.tx.agendamento.groupBy({
        by: ['pacienteId'],
        where: { ...base, status: 'FALTOU' },
        _count: { _all: true },
      }),
      this.txHost.tx.agendamento.groupBy({
        by: ['pacienteId'],
        where: {
          ...base,
          inicio: { gte: new Date() },
          status: { notIn: [...STATUS_FORA_DO_RETORNO] },
        },
        _min: { inicio: true },
      }),
    ]);
    const atendimento = new Map(atendidos.map((a) => [a.pacienteId, a]));
    const totalFaltas = new Map(faltas.map((f) => [f.pacienteId, f._count._all]));
    const retorno = new Map(futuros.map((f) => [f.pacienteId, f._min.inicio]));
    return dtos.map((dto) => ({
      ...dto,
      primeiroAtendimento: atendimento.get(dto.id)?._min.inicio?.toISOString() ?? null,
      ultimoAtendimento: atendimento.get(dto.id)?._max.inicio?.toISOString() ?? null,
      proximoRetorno: retorno.get(dto.id)?.toISOString() ?? null,
      faltas: totalFaltas.get(dto.id) ?? 0,
    }));
  }

  private dados(input: CreatePacienteInput): Prisma.PacienteUncheckedCreateInput {
    // Os consentimentos e o atalho de campanhas viram registros no histórico, não colunas livres.
    const cadastro: Partial<CreatePacienteInput> = { ...input };
    delete cadastro.consentimentos;
    delete cadastro.aceitaCampanhasWhatsapp;
    // A confirmação do alerta de duplicidade (#149) vai para a auditoria, não para a tabela.
    delete cadastro.duplicidadeConfirmada;
    return {
      ...(cadastro as Prisma.PacienteUncheckedCreateInput),
      dataNascimento: input.dataNascimento
        ? new Date(`${input.dataNascimento}T00:00:00.000Z`)
        : null,
    };
  }

  /** Regras que dependem do banco: documento único e origem existente e ativa. */
  private async validar(input: CreatePacienteInput, ignorarId?: string): Promise<void> {
    if (input.documento) {
      const existente = await this.txHost.tx.paciente.findFirst({
        where: {
          ...NAO_EXCLUIDOS,
          documento: input.documento,
          id: ignorarId ? { not: ignorarId } : undefined,
        },
        select: { id: true },
      });
      if (existente) {
        const rotulo = input.tipo === 'PF' ? 'CPF' : 'CNPJ';
        throw new BusinessException(
          'PACIENTE_DOCUMENTO_DUPLICADO',
          `Já existe um cadastro com este ${rotulo} (${PACIENTE_TIPO_ROTULOS[input.tipo]}).`,
          { status: 409, details: [{ field: 'documento', message: `${rotulo} já cadastrado` }] },
        );
      }
    }
    if (input.origemClienteId) {
      const origem = await this.txHost.tx.origemCliente.findFirst({
        where: { id: input.origemClienteId, ...NAO_EXCLUIDOS },
        select: { ativa: true },
      });
      if (!origem?.ativa) {
        throw new BusinessException('ORIGEM_CLIENTE_INVALIDA', 'Origem inválida', {
          status: 400,
          details: [{ field: 'origemClienteId', message: 'Origem inexistente ou inativa' }],
        });
      }
    }
    await this.validarIndicacao(input, ignorarId);
    await this.validarVinculo(input);
  }

  /** Quem indicou, quando é paciente ou profissional, precisa existir (e não ser o próprio paciente). */
  private async validarIndicacao(input: CreatePacienteInput, ignorarId?: string): Promise<void> {
    const id = input.indicacaoReferenciaId;
    if (!id || input.indicacaoTipo === 'TEXTO' || !input.indicacaoTipo) return;
    const valido =
      input.indicacaoTipo === 'PACIENTE'
        ? id !== ignorarId && (await this.existeNaoExcluido(id))
        : await this.profissionalExiste(id);
    if (!valido) {
      throw new BusinessException('PACIENTE_INDICACAO_INVALIDA', 'Quem indicou é inválido', {
        status: 400,
        details: [
          { field: 'indicacaoReferenciaId', message: 'Paciente ou profissional inexistente' },
        ],
      });
    }
  }

  private async validarVinculo(input: CreatePacienteInput): Promise<void> {
    if (
      input.profissionalVinculoId &&
      !(await this.profissionalExiste(input.profissionalVinculoId))
    ) {
      throw new BusinessException('PACIENTE_PROFISSIONAL_INVALIDO', 'Profissional inválido', {
        status: 400,
        details: [{ field: 'profissionalVinculoId', message: 'Profissional inexistente' }],
      });
    }
    if (input.especialidadeVinculoId) {
      const nomes = await this.especialidades.nomesPorIds([input.especialidadeVinculoId]);
      if (!nomes.has(input.especialidadeVinculoId)) {
        throw new BusinessException('PACIENTE_ESPECIALIDADE_INVALIDA', 'Especialidade inválida', {
          status: 400,
          details: [{ field: 'especialidadeVinculoId', message: 'Especialidade inexistente' }],
        });
      }
    }
  }

  private async existeNaoExcluido(id: string): Promise<boolean> {
    const paciente = await this.txHost.tx.paciente.findFirst({
      where: { id, ...NAO_EXCLUIDOS },
      select: { id: true },
    });
    return paciente !== null;
  }

  private async profissionalExiste(id: string): Promise<boolean> {
    return (await this.profissionais.nomesPorIds([id])).has(id);
  }

  protected filtro(query: LookupQuery<'pacientes'>): Prisma.PacienteWhereInput {
    return { ...NAO_EXCLUIDOS, status: { not: 'INATIVO' }, ...buscaPaciente(query.search) };
  }

  /** Total de pacientes não excluídos (alimenta o painel). */
  contar(): Promise<number> {
    return this.fonte.count({ where: { deletedAt: null } });
  }

  protected toItem(paciente: Paciente): LookupItem {
    return { id: paciente.id, label: paciente.nome, descricao: mascararCpf(paciente.documento) };
  }
}
