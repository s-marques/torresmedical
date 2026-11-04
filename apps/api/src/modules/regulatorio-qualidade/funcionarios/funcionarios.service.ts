import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CreateFuncionarioInput,
  ExportFuncionariosQuery,
  Funcionario as FuncionarioDto,
  FuncionarioExportColumn,
  ListFuncionariosQuery,
  LookupItem,
  LookupQuery,
  UpdateFuncionarioInput,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const COM_CARGO = { cargo: { select: { nome: true, departamento: true } } } as const;

/** Funcionário com o nome e o departamento do cargo (coluna "Cargo"/"Departamento" do grid). */
export type FuncionarioComCargo = Prisma.FuncionarioGetPayload<{ include: typeof COM_CARGO }>;

const NAO_EXCLUIDOS = { deletedAt: null } as const;

export const FUNCIONARIO_EXPORT_DEFINITIONS: readonly ExportColumn<
  FuncionarioComCargo,
  FuncionarioExportColumn
>[] = [
  { key: 'nome', header: 'Nome', value: (f) => f.nome, width: 3 },
  { key: 'cargo', header: 'Cargo', value: (f) => f.cargo?.nome ?? '', width: 2 },
  { key: 'departamento', header: 'Departamento', value: (f) => f.cargo?.departamento ?? '' },
  { key: 'telefone', header: 'Telefone', value: (f) => f.telefone ?? '' },
  {
    key: 'tipoContrato',
    header: 'Tipo Contrato',
    value: (f) => f.tipoContrato ?? '',
  },
  {
    key: 'salario',
    header: 'Salário',
    type: 'currency',
    value: (f) => (f.salario === null ? null : Number(f.salario)),
  },
  { key: 'status', header: 'Status', value: (f) => (f.ativo ? 'Ativo' : 'Inativo') },
];

/** Funcionário do módulo Regulatório / Qualidade (Treinamentos, Contas a Pagar, Coleta de Resíduos). */
@Injectable()
export class FuncionariosService extends EntidadeLookupService<
  LookupQuery<'funcionarios'>,
  Prisma.FuncionarioWhereInput,
  FuncionarioComCargo
> {
  protected readonly naoEncontrado = 'Funcionário não encontrado';
  protected readonly fonte: FonteLookup<Prisma.FuncionarioWhereInput, FuncionarioComCargo> = {
    findMany: (args) => this.txHost.tx.funcionario.findMany({ ...args, include: COM_CARGO }),
    count: (args) => this.txHost.tx.funcionario.count(args),
    findFirst: (args) => this.txHost.tx.funcionario.findFirst({ ...args, include: COM_CARGO }),
  };

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {
    super();
  }

  async list(query: ListFuncionariosQuery): Promise<Page<FuncionarioDto>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort);
    const pagina = await paginate(query, {
      findMany: (page) =>
        this.txHost.tx.funcionario.findMany({ where, orderBy, include: COM_CARGO, ...page }),
      count: () => this.txHost.tx.funcionario.count({ where }),
    });
    return { ...pagina, data: pagina.data.map((f) => this.toDto(f)) };
  }

  async findByIdDto(id: string): Promise<FuncionarioDto> {
    return this.toDto(await this.findById(id));
  }

  async create(input: CreateFuncionarioInput): Promise<FuncionarioDto> {
    const criado = await this.txHost.tx.funcionario.create({
      data: this.dados(input),
      include: COM_CARGO,
    });
    return this.toDto(criado);
  }

  async update(id: string, input: UpdateFuncionarioInput): Promise<FuncionarioDto> {
    await this.findById(id);
    const atualizado = await this.txHost.tx.funcionario.update({
      where: { id },
      data: this.dados(input),
      include: COM_CARGO,
    });
    return this.toDto(atualizado);
  }

  /** Exclusão lógica. Comissões lançadas seguem vinculadas ao histórico do funcionário. */
  async remove(id: string): Promise<FuncionarioDto> {
    await this.findById(id);
    const removido = await this.txHost.tx.funcionario.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: COM_CARGO,
    });
    return this.toDto(removido);
  }

  async export(query: ExportFuncionariosQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.funcionario.count({ where }));
    const rows = await this.txHost.tx.funcionario.findMany({
      where,
      orderBy: toOrderBy(query.sort),
      include: COM_CARGO,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Funcionários',
      filename: 'funcionarios',
      columns: selectColumns(FUNCIONARIO_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  private where(
    query: Pick<ListFuncionariosQuery, 'search' | 'status'>,
  ): Prisma.FuncionarioWhereInput {
    return {
      ...NAO_EXCLUIDOS,
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome', 'telefone', 'email', 'cpf']),
    };
  }

  private dados(input: CreateFuncionarioInput): Prisma.FuncionarioUncheckedCreateInput {
    const { status, cargoId, dataNascimento, dataAdmissao, salario, ...campos } = input;
    return {
      ...campos,
      cargoId,
      ativo: status === 'ativo',
      dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
      dataAdmissao: dataAdmissao ? new Date(dataAdmissao) : null,
      salario: salario ?? null,
    };
  }

  private toDto(funcionario: FuncionarioComCargo): FuncionarioDto {
    const { cargo, salario, dataNascimento, dataAdmissao, ativo, ...resto } = funcionario;
    return {
      ...resto,
      cargoNome: cargo?.nome ?? null,
      departamento: cargo?.departamento ?? null,
      salario: salario === null ? null : salario.toString(),
      dataNascimento: dataNascimento ? dataNascimento.toISOString().slice(0, 10) : null,
      dataAdmissao: dataAdmissao ? dataAdmissao.toISOString().slice(0, 10) : null,
      ativo,
      createdAt: funcionario.createdAt.toISOString(),
      updatedAt: funcionario.updatedAt.toISOString(),
    };
  }

  protected filtro(query: LookupQuery<'funcionarios'>): Prisma.FuncionarioWhereInput {
    return { ...SELECIONAVEIS, ...searchWhere(query.search, ['nome']) };
  }

  protected toItem(funcionario: FuncionarioComCargo): LookupItem {
    return {
      id: funcionario.id,
      label: funcionario.nome,
      descricao: funcionario.cargo?.nome ?? null,
    };
  }
}
