import {
  RECEITUARIO_BLOCO_STATUS_ROTULOS,
  RECEITUARIO_TIPO_ROTULOS,
  RECEITUARIO_TIPO_ROTULOS_FILTRO,
  type ReceituarioBlocoStatus,
  type ReceituarioTipo,
} from '@torres/shared';
import type { TomStatus } from '@/components/shared/StatusBadge';
import type { FiltroGrid } from '@/components/shared/data-grid/tipos';

export const TOM_STATUS_BLOCO: Record<ReceituarioBlocoStatus, TomStatus> = {
  ATIVO: 'sucesso',
  FINALIZADO: 'neutro',
  CANCELADO: 'perigo',
};

/** Cor do tipo de receituário, como a cor do talão. */
export const TOM_TIPO: Record<ReceituarioTipo, TomStatus> = {
  AMARELA: 'alerta',
  AZUL: 'info',
  BRANCA: 'neutro',
};

/** Select "Todos os tipos" (itens do inventário: Amarela · Azul · Branca). */
export const FILTRO_TIPO: FiltroGrid = {
  tipo: 'select',
  parametro: 'tipo',
  rotulo: 'Tipo',
  rotuloTodos: 'Todos os tipos',
  opcoes: Object.entries(RECEITUARIO_TIPO_ROTULOS_FILTRO).map(([valor, rotulo]) => ({
    valor,
    rotulo,
  })),
};

/** Opções do select "Tipo" do Novo Bloco: Amarela (A), Azul (B), Branca (C). */
export const OPCOES_TIPO = Object.entries(RECEITUARIO_TIPO_ROTULOS).map(([valor, rotulo]) => ({
  valor,
  rotulo,
}));

/** Select "Todos" de status (itens do inventário: Ativo · Finalizado · Cancelado). */
export const FILTRO_STATUS_BLOCO: FiltroGrid = {
  tipo: 'select',
  parametro: 'status',
  rotulo: 'Status',
  rotuloTodos: 'Todos',
  opcoes: Object.entries(RECEITUARIO_BLOCO_STATUS_ROTULOS).map(([valor, rotulo]) => ({
    valor,
    rotulo,
  })),
};
