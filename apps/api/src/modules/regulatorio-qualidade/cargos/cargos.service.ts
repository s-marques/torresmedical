import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CargoExportColumn,
  CreateCargoInput,
  ExportCargosQuery,
  ListCargosQuery,
  LookupItem,
  LookupQuery,
  UpdateCargoInput,
} from '@torres/shared';
import type { Cargo, Prisma } from '../../../generated/prisma/client';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

export const CARGO_EXPORT_DEFINITIONS: readonly ExportColumn<Cargo, CargoExportColumn>[] = [
  { key: 'nome', header: 'Nome', value: (c) => c.nome, width: 3 },
  { key: 'departamento', header: 'Departamento', value: (c) => c.departamento ?? '', width: 2 },
  { key: 'descricao', header: 'Descrição', value: (c) => c.descricao ?? '', width: 3 },
  {
    key: 'salarioBase',
    header: 'Salário Base',
    type: 'currency',
    value: (c) => (c.salarioBase === null ? null : Number(c.salarioBase)),
  },
  { key: 'status', header: 'Status', value: (c) => (c.ativo ? 'Ativo' : 'Inativo') },
];

/** Cargo dos funcionários (aba "Cargos" da tela Funcionários). */
@Injectable()
export class CargosService extends EntidadeLookupService<
  LookupQuery<'cargos'>,
  Prisma.CargoWhereInput,
  Cargo
> {
  protected readonly naoEncontrado = 'Cargo não encontrado';
  protected readonly fonte: FonteLookup<Prisma.CargoWhereInput, Cargo> = {
    findMany: (args) => this.txHost.tx.cargo.findMany(args),
    count: (args) => this.txHost.tx.cargo.count(args),
    findFirst: (args) => this.txHost.tx.cargo.findFirst(args),
  };

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {
    super();
  }

  list(query: ListCargosQuery): Promise<Page<Cargo>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.cargo.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.cargo.count({ where }),
    });
  }

  create(input: CreateCargoInput): Promise<Cargo> {
    return this.txHost.tx.cargo.create({ data: this.dados(input) });
  }

  async update(id: string, input: UpdateCargoInput): Promise<Cargo> {
    await this.findById(id);
    return this.txHost.tx.cargo.update({ where: { id }, data: this.dados(input) });
  }

  /** Exclusão lógica. Funcionários com esse cargo seguem apontando para ele (não bloqueia). */
  async remove(id: string): Promise<Cargo> {
    await this.findById(id);
    return this.txHost.tx.cargo.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async export(query: ExportCargosQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.cargo.count({ where }));
    const rows = await this.txHost.tx.cargo.findMany({
      where,
      orderBy: toOrderBy(query.sort),
    });
    return this.exportService.export({
      format: query.format,
      title: 'Cargos',
      filename: 'cargos',
      columns: selectColumns(CARGO_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  private where(query: Pick<ListCargosQuery, 'search' | 'status'>): Prisma.CargoWhereInput {
    return {
      ...NAO_EXCLUIDOS,
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome', 'departamento']),
    };
  }

  private dados(input: CreateCargoInput): Prisma.CargoUncheckedCreateInput {
    const { status, ...campos } = input;
    return { ...campos, ativo: status === 'ativo' };
  }

  protected filtro(query: LookupQuery<'cargos'>): Prisma.CargoWhereInput {
    return { ...SELECIONAVEIS, ...searchWhere(query.search, ['nome']) };
  }

  protected toItem(cargo: Cargo): LookupItem {
    return { id: cargo.id, label: cargo.nome, descricao: cargo.departamento };
  }
}
