import type { TipoItem } from '@torres/shared';
import type { TipoItem as TipoItemPrisma } from '../../generated/prisma/client';

/** Valor da query (`produto`/`servico`) → enum do banco. */
export const TIPO_ITEM: Readonly<Record<TipoItem, TipoItemPrisma>> = {
  produto: 'PRODUTO',
  servico: 'SERVICO',
};

const ROTULO_TIPO_ITEM: Readonly<Record<TipoItemPrisma, string>> = {
  PRODUTO: 'Produto',
  SERVICO: 'Serviço',
};

export function rotuloTipoItem(tipo: TipoItemPrisma): string {
  return ROTULO_TIPO_ITEM[tipo];
}

/** Filtro opcional por tipo: sem `tipo`, o Prisma ignora o campo. */
export function filtroTipoItem(tipo: TipoItem | undefined): TipoItemPrisma | undefined {
  return tipo ? TIPO_ITEM[tipo] : undefined;
}
