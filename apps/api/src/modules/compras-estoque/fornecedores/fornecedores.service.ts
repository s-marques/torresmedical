import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CreateFornecedorInput,
  ExportFornecedoresQuery,
  FornecedorExportColumn,
  ListFornecedoresQuery,
  LookupItem,
  LookupQuery,
  UpdateFornecedorInput,
  ItemBusca,
} from '@torres/shared';
import type { Fornecedor, Prisma } from '../../../generated/prisma/client';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** `Cuiabá/MT`, `Cuiabá` ou `MT`, conforme o que estiver preenchido. */
export function cidadeUf(fornecedor: Pick<Fornecedor, 'cidade' | 'uf'>): string | null {
  const partes = [fornecedor.cidade, fornecedor.uf].filter(Boolean);
  return partes.length > 0 ? partes.join('/') : null;
}

const NAO_EXCLUIDOS = { deletedAt: null } as const;

/** O chip e a coluna "Status" do grid são o campo `ativo`. */
const CAMPO_ORDENACAO = { status: 'ativo' } as const;

/** Colunas exportáveis, iguais às do grid. */
export const FORNECEDOR_EXPORT_DEFINITIONS: readonly ExportColumn<
  Fornecedor,
  FornecedorExportColumn
>[] = [
  { key: 'nome', header: 'Nome', value: (f) => f.nome, width: 3 },
  { key: 'documento', header: 'CNPJ/CPF', value: (f) => f.documento ?? '', width: 2 },
  { key: 'email', header: 'Email', value: (f) => f.email ?? '', width: 3 },
  { key: 'telefone', header: 'Telefone', value: (f) => f.telefone ?? '' },
  { key: 'cidade', header: 'Cidade/UF', value: (f) => cidadeUf(f) ?? '' },
  { key: 'status', header: 'Status', value: (f) => (f.ativo ? 'Ativo' : 'Inativo') },
];

/** Fornecedor do módulo Compras / Estoque (Entrada de Compras, Pedidos, Contas a Pagar). */
@Injectable()
export class FornecedoresService extends EntidadeLookupService<
  LookupQuery<'fornecedores'>,
  Prisma.FornecedorWhereInput,
  Fornecedor
> {
  protected readonly naoEncontrado = 'Fornecedor não encontrado';
  protected readonly fonte: FonteLookup<Prisma.FornecedorWhereInput, Fornecedor> = {
    findMany: (args) => this.txHost.tx.fornecedor.findMany(args),
    count: (args) => this.txHost.tx.fornecedor.count(args),
    findFirst: (args) => this.txHost.tx.fornecedor.findFirst(args),
  };

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {
    super();
  }

  list(query: ListFornecedoresQuery): Promise<Page<Fornecedor>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort, CAMPO_ORDENACAO);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.fornecedor.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.fornecedor.count({ where }),
    });
  }

  /** Documento repetido é permitido (confirmado pelo dev na issue #21). */
  create(input: CreateFornecedorInput): Promise<Fornecedor> {
    return this.txHost.tx.fornecedor.create({ data: this.dados(input) });
  }

  async update(id: string, input: UpdateFornecedorInput): Promise<Fornecedor> {
    await this.findById(id);
    return this.txHost.tx.fornecedor.update({ where: { id }, data: this.dados(input) });
  }

  /** Exclusão lógica. Compras e Contas a Pagar passam a bloquear quando referenciarem o fornecedor. */
  async remove(id: string): Promise<Fornecedor> {
    await this.findById(id);
    return this.txHost.tx.fornecedor.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async export(query: ExportFornecedoresQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.fornecedor.count({ where }));
    const rows = await this.txHost.tx.fornecedor.findMany({
      where,
      orderBy: toOrderBy(query.sort, CAMPO_ORDENACAO),
    });
    return this.exportService.export({
      format: query.format,
      title: 'Fornecedores',
      filename: 'fornecedores',
      columns: selectColumns(FORNECEDOR_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  /** Busca global do ⌘K (issue #159): razão social, nome fantasia, CNPJ/CPF e e-mail. */
  async buscaGlobal(termo: string, limite: number): Promise<ItemBusca[]> {
    const digitos = termo.replaceAll(/\D/g, '');
    const texto = searchWhere(termo, ['nome', 'nomeFantasia', 'documento', 'email']);
    const fornecedores = await this.txHost.tx.fornecedor.findMany({
      where: {
        ...NAO_EXCLUIDOS,
        OR: [...(texto?.OR ?? []), ...(digitos ? [{ documento: { contains: digitos } }] : [])],
      },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      take: limite,
      select: { id: true, nome: true, nomeFantasia: true },
    });
    return fornecedores.map((f) => ({
      id: f.id,
      titulo: f.nome,
      descricao: f.nomeFantasia,
      rota: `/fornecedores?search=${encodeURIComponent(termo)}`,
    }));
  }

  private where(
    query: Pick<ListFornecedoresQuery, 'search' | 'status'>,
  ): Prisma.FornecedorWhereInput {
    return {
      ...NAO_EXCLUIDOS,
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome', 'nomeFantasia', 'documento', 'email']),
    };
  }

  private dados(input: CreateFornecedorInput): Prisma.FornecedorUncheckedCreateInput {
    const { status, ...campos } = input;
    return { ...campos, ativo: status === 'ativo' };
  }

  protected filtro(query: LookupQuery<'fornecedores'>): Prisma.FornecedorWhereInput {
    return { ...SELECIONAVEIS, ...searchWhere(query.search, ['nome', 'documento']) };
  }

  protected toItem(fornecedor: Fornecedor): LookupItem {
    return { id: fornecedor.id, label: fornecedor.nome, descricao: cidadeUf(fornecedor) };
  }
}
