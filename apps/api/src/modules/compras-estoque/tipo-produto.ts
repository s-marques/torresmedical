import type { ProdutoTipo, TipoItem } from '@torres/shared';
import type { ProdutoTipo as ProdutoTipoPrisma } from '../../generated/prisma/client';

/** Valor da entrada (`produto`/`revenda`/`uso-consumo`/`servico`) → enum do banco. */
export const TIPO_PRODUTO: Readonly<Record<ProdutoTipo, ProdutoTipoPrisma>> = {
  produto: 'PRODUTO',
  revenda: 'REVENDA',
  'uso-consumo': 'USO_CONSUMO',
  servico: 'SERVICO',
};

const ROTULO_TIPO_PRODUTO: Readonly<Record<ProdutoTipoPrisma, string>> = {
  PRODUTO: 'Produto',
  REVENDA: 'Revenda',
  USO_CONSUMO: 'Uso e Consumo',
  SERVICO: 'Serviço',
};

export function rotuloTipoProduto(tipo: ProdutoTipoPrisma): string {
  return ROTULO_TIPO_PRODUTO[tipo];
}

/**
 * Chips Produtos/Serviços e lookups por `tipo`: `produto` agrupa Produto, Revenda e Uso e
 * Consumo; `servico` é só Serviço. Sem `tipo`, o Prisma ignora o campo.
 */
export function filtroGrupoProduto(
  tipo: TipoItem | undefined,
): ProdutoTipoPrisma | { in: ProdutoTipoPrisma[] } | undefined {
  if (tipo === 'servico') return 'SERVICO';
  if (tipo === 'produto') return { in: ['PRODUTO', 'REVENDA', 'USO_CONSUMO'] };
  return undefined;
}
