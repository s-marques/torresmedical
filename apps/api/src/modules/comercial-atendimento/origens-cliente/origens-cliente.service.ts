import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  gerarCodigoOrigemCliente,
  type CreateOrigemClienteInput,
  type ExportOrigensClienteQuery,
  type ListOrigensClienteQuery,
  type MoverOrigemClienteInput,
  type OrigemClienteExportColumn,
  type UpdateOrigemClienteInput,
} from '@torres/shared';
import type { OrigemCliente, Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { buscarPorId, type FonteLookup } from '../../../common/lookups/lookup-query';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const ENTITY = 'OrigemCliente';
const NAO_EXCLUIDAS = { deletedAt: null } as const;
const ORDEM_DA_LISTA = [{ ordem: 'asc' }, { id: 'asc' }] as const;

/** Colunas exportáveis, iguais às do grid. */
export const ORIGEM_CLIENTE_EXPORT_DEFINITIONS: readonly ExportColumn<
  OrigemCliente,
  OrigemClienteExportColumn
>[] = [
  { key: 'ordem', header: 'Ordem', type: 'number', value: (o) => o.ordem },
  { key: 'nome', header: 'Nome', value: (o) => o.nome, width: 3 },
  { key: 'codigo', header: 'Código', value: (o) => o.codigo, width: 3 },
  { key: 'ativa', header: 'Ativa', value: (o) => (o.ativa ? 'Sim' : 'Não') },
];

/**
 * Origens de Cliente (de onde os pacientes chegam). Entidade do módulo Comercial / Atendimento,
 * usada no cadastro de clientes e nos relatórios de captação.
 */
@Injectable()
export class OrigensClienteService {
  private readonly fonte: FonteLookup<Prisma.OrigemClienteWhereInput, OrigemCliente> = {
    findMany: (args) => this.txHost.tx.origemCliente.findMany(args),
    count: (args) => this.txHost.tx.origemCliente.count(args),
    findFirst: (args) => this.txHost.tx.origemCliente.findFirst(args),
  };

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListOrigensClienteQuery): Promise<Page<OrigemCliente>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: (page) => this.txHost.tx.origemCliente.findMany({ where, orderBy, ...page }),
      count: () => this.txHost.tx.origemCliente.count({ where }),
    });
  }

  /** Origem não excluída (ativa ou inativa); 404 se não existir. */
  findById(id: string): Promise<OrigemCliente> {
    return buscarPorId(this.fonte, id, 'Origem de cliente não encontrada');
  }

  /** Nova origem: o código vem do nome e ela entra no fim da lista. */
  async create(input: CreateOrigemClienteInput): Promise<OrigemCliente> {
    const codigo = this.codigoDe(input.nome);
    await this.ensureDisponivel(input.nome, codigo);
    const ultima = await this.txHost.tx.origemCliente.aggregate({ _max: { ordem: true } });
    return this.txHost.tx.origemCliente.create({
      data: { nome: input.nome, codigo, ordem: (ultima._max.ordem ?? 0) + 1 },
    });
  }

  /** Renomear: o código gerado na criação não muda, porque outros dados podem referenciá-lo. */
  async update(id: string, input: UpdateOrigemClienteInput): Promise<OrigemCliente> {
    await this.findById(id);
    this.codigoDe(input.nome);
    await this.ensureDisponivel(input.nome, undefined, id);
    return this.txHost.tx.origemCliente.update({ where: { id }, data: { nome: input.nome } });
  }

  async alterarAtiva(id: string, ativa: boolean): Promise<OrigemCliente> {
    await this.findById(id);
    return this.txHost.tx.origemCliente.update({ where: { id }, data: { ativa } });
  }

  /**
   * Troca a ordem com a origem vizinha (setas da lista). Na ponta da lista, nada muda.
   * A vizinha também tem a alteração gravada no audit_log.
   */
  async mover(id: string, { direcao }: MoverOrigemClienteInput): Promise<OrigemCliente> {
    const origem = await this.findById(id);
    const lista = await this.txHost.tx.origemCliente.findMany({
      where: NAO_EXCLUIDAS,
      orderBy: [...ORDEM_DA_LISTA],
    });
    const posicao = lista.findIndex((o) => o.id === id);
    const vizinha = lista[direcao === 'cima' ? posicao - 1 : posicao + 1];
    if (!vizinha) return origem;

    const movida = await this.txHost.tx.origemCliente.update({
      where: { id },
      data: { ordem: vizinha.ordem },
    });
    const deslocada = await this.txHost.tx.origemCliente.update({
      where: { id: vizinha.id },
      data: { ordem: origem.ordem },
    });
    await this.audit.record({
      action: 'UPDATE',
      entity: ENTITY,
      entityId: vizinha.id,
      before: vizinha,
      after: deslocada,
    });
    return movida;
  }

  /** Exclusão lógica. Só é possível se nenhum cliente estiver usando a origem. */
  async remove(id: string): Promise<OrigemCliente> {
    await this.findById(id);
    const emUso = await this.txHost.tx.paciente.count({
      where: { origemClienteId: id, ...NAO_EXCLUIDAS },
    });
    if (emUso > 0) {
      throw new BusinessException(
        'ORIGEM_CLIENTE_EM_USO',
        'Não é possível excluir: há clientes usando esta origem.',
        { status: 409 },
      );
    }
    return this.txHost.tx.origemCliente.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async export(query: ExportOrigensClienteQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.origemCliente.count({ where }));
    const rows = await this.txHost.tx.origemCliente.findMany({
      where,
      orderBy: toOrderBy(query.sort),
    });
    return this.exportService.export({
      format: query.format,
      title: 'Origens de Cliente',
      filename: 'origens-cliente',
      columns: selectColumns(ORIGEM_CLIENTE_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  private where(
    query: Pick<ListOrigensClienteQuery, 'search' | 'status'>,
  ): Prisma.OrigemClienteWhereInput {
    return {
      ...NAO_EXCLUIDAS,
      ativa: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome', 'codigo']),
    };
  }

  /** Um nome só de símbolos não gera código. */
  private codigoDe(nome: string): string {
    const codigo = gerarCodigoOrigemCliente(nome);
    if (!codigo) {
      throw new BusinessException('ORIGEM_CLIENTE_NOME_INVALIDO', 'Nome inválido', {
        status: 400,
        details: [{ field: 'nome', message: 'Use letras ou números no nome' }],
      });
    }
    return codigo;
  }

  private async ensureDisponivel(
    nome: string,
    codigo: string | undefined,
    ignorarId?: string,
  ): Promise<void> {
    const existente = await this.txHost.tx.origemCliente.findFirst({
      where: {
        ...NAO_EXCLUIDAS,
        id: ignorarId ? { not: ignorarId } : undefined,
        OR: [{ nome: { equals: nome, mode: 'insensitive' } }, ...(codigo ? [{ codigo }] : [])],
      },
      select: { id: true },
    });
    if (existente) {
      const message = `Já existe uma origem chamada '${nome}'.`;
      throw new BusinessException('ORIGEM_CLIENTE_DUPLICADA', message, { status: 409 });
    }
  }
}
