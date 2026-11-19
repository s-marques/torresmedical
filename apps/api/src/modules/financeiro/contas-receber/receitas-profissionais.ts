import {
  CONTA_RECEBER_ROTULO_STATUS_EXIBICAO,
  statusExibicaoContaReceber,
  type ContaReceberStatus,
  type ListReceitaProfissionaisQuery,
  type ReceitaProfissional,
  type ReceitaProfissionalExportColumn,
  type ResumoReceitaProfissionaisQuery,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import type { FiltroProfissional } from '../../../common/auth/escopo-dados.service';
import type { ExportColumn } from '../../../common/export/export.types';
import { NAO_EXCLUIDAS, whereContaFinanceira } from '../conta-financeira';

/**
 * Receita Profissionais (tela de Gestão Profissionais): contas a receber com `profissionalId`.
 * Os dados são do Financeiro; o módulo Gestão Profissionais os consulta por
 * `ContasReceberService`, informando o escopo do usuário em `profissional`.
 */

type Filtros = Pick<
  ResumoReceitaProfissionaisQuery,
  'search' | 'status' | 'vencimentoDe' | 'vencimentoAte' | 'profissionalId' | 'formaPagamentoId'
>;

/** Receitas visíveis: só as de profissional (no escopo) e sem as canceladas, salvo filtro. */
export function whereReceitas(
  query: Filtros,
  profissional: FiltroProfissional,
): Prisma.ContaReceberWhereInput {
  const base = whereContaFinanceira<ContaReceberStatus, Prisma.ContaReceberWhereInput>(query, [
    { paciente: { nome: { contains: query.search, mode: 'insensitive' } } },
    { profissional: { nome: { contains: query.search, mode: 'insensitive' } } },
  ]);
  return {
    ...base,
    status: base.status ?? { not: 'CANCELADO' },
    profissionalId: profissional ?? { not: null },
    formaPagamentoId: query.formaPagamentoId,
  };
}

/** Receita (conta de qualquer status) de um profissional: usada nas ações da linha. */
export function whereReceitaPorId(id: string): Prisma.ContaReceberWhereInput {
  return { id, ...NAO_EXCLUIDAS, profissionalId: { not: null } };
}

export function orderByReceitas(
  sort: ListReceitaProfissionaisQuery['sort'],
): Prisma.ContaReceberOrderByWithRelationInput[] {
  const { field, direction } = sort;
  let principal: Prisma.ContaReceberOrderByWithRelationInput;
  if (field === 'profissional') principal = { profissional: { nome: direction } };
  else if (field === 'paciente') principal = { paciente: { nome: direction } };
  else principal = { [field]: direction };
  return [principal, { id: direction }];
}

/** Colunas exportáveis, iguais às do grid. */
export const RECEITA_PROFISSIONAL_EXPORT_DEFINITIONS: readonly ExportColumn<
  ReceitaProfissional,
  ReceitaProfissionalExportColumn
>[] = [
  {
    key: 'dataVencimento',
    header: 'Data',
    type: 'date',
    value: (r) => r.dataVencimento,
  },
  { key: 'profissional', header: 'Profissional', value: (r) => r.profissionalNome, width: 3 },
  { key: 'paciente', header: 'Paciente', value: (r) => r.pacienteNome ?? '', width: 3 },
  { key: 'descricao', header: 'Descrição', value: (r) => r.descricao, width: 3 },
  { key: 'formaPagamento', header: 'Forma Pgto', value: (r) => r.formaPagamentoNome ?? '' },
  { key: 'valor', header: 'Valor', type: 'currency', value: (r) => r.valor },
  {
    key: 'status',
    header: 'Status',
    value: (r) => CONTA_RECEBER_ROTULO_STATUS_EXIBICAO[statusExibicaoContaReceber(r)],
  },
];
