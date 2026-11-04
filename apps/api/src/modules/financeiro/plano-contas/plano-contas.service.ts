import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  compararCodigosConta,
  PLANO_CONTA_ROTULO_TIPO,
  type CreatePlanoContaInput,
  type ExportPlanoContasQuery,
  type ListPlanoContasQuery,
  type PlanoContaExportColumn,
  type PlanoContaTipo,
  type UpdatePlanoContaInput,
} from '@torres/shared';
import type {
  PlanoConta,
  PlanoContaTipo as PlanoContaTipoPrisma,
  Prisma,
} from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { searchWhere } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const TIPO: Readonly<Record<PlanoContaTipo, PlanoContaTipoPrisma>> = {
  receita: 'RECEITA',
  despesa: 'DESPESA',
  ativo: 'ATIVO',
  passivo: 'PASSIVO',
};

const NAO_EXCLUIDAS = { deletedAt: null } as const;

/** Colunas exportáveis (botão Imprimir), iguais às do grid. */
export const PLANO_CONTA_EXPORT_DEFINITIONS: readonly ExportColumn<
  PlanoConta,
  PlanoContaExportColumn
>[] = [
  { key: 'codigo', header: 'Código', value: (c) => c.codigo },
  { key: 'nome', header: 'Nome', value: (c) => c.nome, width: 3 },
  { key: 'tipo', header: 'Tipo', value: (c) => PLANO_CONTA_ROTULO_TIPO[c.tipo] },
  { key: 'nivel', header: 'Nível', type: 'number', value: (c) => c.nivel },
  { key: 'ativo', header: 'Ativo', value: (c) => (c.ativo ? 'Sim' : 'Não') },
];

/** Plano de Contas do Financeiro: contas contábeis em árvore (`contaPaiId`). */
@Injectable()
export class PlanoContasService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  /** Sem paginação: a tela mostra a árvore inteira, em ordem natural de código. */
  async list(query: ListPlanoContasQuery): Promise<{ data: PlanoConta[]; total: number }> {
    const data = await this.buscar(query);
    return { data, total: data.length };
  }

  async findById(id: string): Promise<PlanoConta> {
    const conta = await this.txHost.tx.planoConta.findFirst({
      where: { id, ...NAO_EXCLUIDAS },
    });
    if (!conta) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Conta não encontrada', { status: 404 });
    }
    return conta;
  }

  async create(input: CreatePlanoContaInput): Promise<PlanoConta> {
    const pai = input.contaPaiId ? await this.findById(input.contaPaiId) : null;
    return this.txHost.tx.planoConta.create({
      data: {
        codigo: input.codigo,
        nome: input.nome,
        tipo: TIPO[input.tipo],
        contaPaiId: pai?.id ?? null,
        nivel: pai ? pai.nivel + 1 : 1,
      },
    });
  }

  /** Também serve ao interruptor Ativar/Desativar da linha (`{ ativo }`): atinge só a própria conta. */
  async update(id: string, input: UpdatePlanoContaInput): Promise<PlanoConta> {
    const atual = await this.findById(id);
    const { tipo, contaPaiId, ...resto } = input;
    const mudaPai = contaPaiId !== undefined && contaPaiId !== atual.contaPaiId;
    const pai = mudaPai && contaPaiId ? await this.validarNovoPai(atual, contaPaiId) : null;
    const nivel = mudaPai ? (pai ? pai.nivel + 1 : 1) : atual.nivel;

    const conta = await this.txHost.tx.planoConta.update({
      where: { id },
      data: {
        ...resto,
        tipo: tipo ? TIPO[tipo] : undefined,
        ...(mudaPai ? { contaPaiId: pai?.id ?? null, nivel } : {}),
      },
    });
    if (nivel !== atual.nivel) await this.recalcularNiveis(conta);
    return conta;
  }

  /**
   * Exclusão lógica. Conta com subcontas não é excluída. O código é liberado para reutilização
   * (a coluna é única), mantendo o original no `audit_log`.
   */
  async remove(id: string): Promise<PlanoConta> {
    const conta = await this.findById(id);
    const filhas = await this.txHost.tx.planoConta.count({
      where: { contaPaiId: id, ...NAO_EXCLUIDAS },
    });
    if (filhas > 0) {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        'Não é possível excluir uma conta que possui subcontas. Exclua as subcontas primeiro.',
      );
    }
    return this.txHost.tx.planoConta.update({
      where: { id },
      data: { deletedAt: new Date(), codigo: `${conta.codigo}#excluida-${conta.id.slice(0, 8)}` },
    });
  }

  async export(query: ExportPlanoContasQuery): Promise<ExportFile> {
    const rows = await this.buscar(query);
    this.exportService.ensureWithinLimit(rows.length);
    return this.exportService.export({
      format: query.format,
      title: 'Plano de Contas',
      filename: 'plano-contas',
      columns: selectColumns(PLANO_CONTA_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  private async buscar(query: ListPlanoContasQuery): Promise<PlanoConta[]> {
    const where: Prisma.PlanoContaWhereInput = {
      ...NAO_EXCLUIDAS,
      tipo: query.tipo ? TIPO[query.tipo] : undefined,
      ...searchWhere(query.search, ['codigo', 'nome']),
    };
    const contas = await this.txHost.tx.planoConta.findMany({ where });
    return contas.sort((a, b) => compararCodigosConta(a.codigo, b.codigo));
  }

  /** O novo pai deve existir e não pode ser a própria conta nem uma de suas descendentes. */
  private async validarNovoPai(conta: PlanoConta, paiId: string): Promise<PlanoConta> {
    const pai = await this.findById(paiId);
    const ids = await this.idsDescendentes(conta.id);
    if (pai.id === conta.id || ids.has(pai.id)) {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        'A conta pai não pode ser a própria conta nem uma de suas subcontas.',
      );
    }
    return pai;
  }

  private async idsDescendentes(raizId: string): Promise<Set<string>> {
    const todas = await this.txHost.tx.planoConta.findMany({
      where: NAO_EXCLUIDAS,
      select: { id: true, contaPaiId: true },
    });
    const filhasDe = new Map<string, string[]>();
    for (const { id, contaPaiId } of todas) {
      if (contaPaiId) filhasDe.set(contaPaiId, [...(filhasDe.get(contaPaiId) ?? []), id]);
    }
    const encontrados = new Set<string>();
    const fila = [raizId];
    for (let id = fila.pop(); id !== undefined; id = fila.pop()) {
      for (const filha of filhasDe.get(id) ?? []) {
        encontrados.add(filha);
        fila.push(filha);
      }
    }
    return encontrados;
  }

  /** Depois de mover uma conta, as descendentes seguem o novo nível do pai. */
  private async recalcularNiveis(pai: PlanoConta): Promise<void> {
    const filhas = await this.txHost.tx.planoConta.findMany({
      where: { contaPaiId: pai.id, ...NAO_EXCLUIDAS },
    });
    for (const filha of filhas) {
      const atualizada = await this.txHost.tx.planoConta.update({
        where: { id: filha.id },
        data: { nivel: pai.nivel + 1 },
      });
      await this.recalcularNiveis(atualizada);
    }
  }
}
