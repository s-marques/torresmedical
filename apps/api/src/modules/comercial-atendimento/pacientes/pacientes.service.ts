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
  type UpdatePacienteInput,
} from '@torres/shared';
import type { Paciente, Prisma } from '../../../generated/prisma/client';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { EntidadeLookupService, type FonteLookup } from '../../../common/lookups/lookup-query';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { PacientesVinculadosService } from '../../consultorio-assistencial/pacientes-vinculados/pacientes-vinculados.service';

const CPF_DIGITOS = 11;
const NAO_EXCLUIDOS = { deletedAt: null } as const;
const COM_ORIGEM = { origemCliente: { select: { nome: true } } } as const;

type PacienteComOrigem = Paciente & { origemCliente: { nome: string } | null };

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
export function toPacienteDto({
  origemCliente,
  deletedAt: _deletedAt,
  ...p
}: PacienteComOrigem): PacienteDto {
  return {
    ...p,
    dataNascimento: p.dataNascimento?.toISOString().slice(0, 10) ?? null,
    origemNome: origemCliente?.nome ?? null,
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

/** CPF parcialmente oculto para diferenciar homônimos sem expor o documento: `***.456.789-**`. */
export function mascararCpf(documento: string | null): string | null {
  if (documento?.length !== CPF_DIGITOS) return null;
  return `***.${documento.slice(3, 6)}.${documento.slice(6, 9)}-**`;
}

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
  ) {
    super();
  }

  /**
   * Tela Pacientes: busca, status e ordenação (a origem ordena pelo nome dela). Usuário com
   * escopo restrito vê só os pacientes vinculados aos seus profissionais (issue #153).
   */
  async list(query: ListPacientesQuery): Promise<Page<PacienteDto>> {
    const where = await this.whereNoEscopo(query);
    const orderBy = this.orderBy(query.sort);
    return paginate(query, {
      findMany: async (page) =>
        (
          await this.txHost.tx.paciente.findMany({ where, orderBy, include: COM_ORIGEM, ...page })
        ).map(toPacienteDto),
      count: () => this.txHost.tx.paciente.count({ where }),
    });
  }

  /**
   * Detalhe para outros módulos, sem o escopo: quem chama já aplicou o seu (ex.: o agendamento do
   * Atendimento Médico). A tela Pacientes usa `detalheNoEscopo`.
   */
  async detalhe(id: string): Promise<PacienteDto> {
    return toPacienteDto(await this.buscarComOrigem(id));
  }

  /** `GET /pacientes/:id`: 404 se não existe; 403 se não está vinculado ao usuário restrito. */
  async detalheNoEscopo(id: string): Promise<PacienteDto> {
    const paciente = await this.buscarComOrigem(id);
    await this.vinculados.garantir(id);
    return toPacienteDto(paciente);
  }

  async create(input: CreatePacienteInput): Promise<PacienteDto> {
    await this.validar(input);
    const criado = await this.txHost.tx.paciente.create({
      data: this.dados(input),
      include: COM_ORIGEM,
    });
    return toPacienteDto(criado);
  }

  async update(id: string, input: UpdatePacienteInput): Promise<PacienteDto> {
    await this.findById(id);
    await this.vinculados.garantir(id);
    await this.validar(input, id);
    const alterado = await this.txHost.tx.paciente.update({
      where: { id },
      data: this.dados(input),
      include: COM_ORIGEM,
    });
    return toPacienteDto(alterado);
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
    return toPacienteDto(excluido);
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

  private where(query: Pick<ListPacientesQuery, 'search' | 'status'>): Prisma.PacienteWhereInput {
    return { ...NAO_EXCLUIDOS, status: query.status, ...buscaLista(query.search) };
  }

  /** Filtros da lista e da exportação, limitados aos pacientes vinculados quando restrito. */
  private async whereNoEscopo(
    query: Pick<ListPacientesQuery, 'search' | 'status'>,
  ): Promise<Prisma.PacienteWhereInput> {
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

  private dados(input: CreatePacienteInput): Prisma.PacienteUncheckedCreateInput {
    return {
      ...input,
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
