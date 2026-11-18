import {
  abreviarDiaSemana,
  CAMPANHA_FILTRO_ROTULO,
  CAMPANHA_TIPO_ENVIO_ROTULO,
  CAMPANHA_TIPOS_ENVIO,
  CAMPANHA_VARIAVEIS,
  type CampanhaFiltro,
} from '@torres/shared';

export const OPCOES_TIPO_ENVIO = CAMPANHA_TIPOS_ENVIO.map((tipo) => ({
  valor: tipo,
  rotulo: CAMPANHA_TIPO_ENVIO_ROTULO[tipo],
}));

export const AJUDA_VARIAVEIS = `Variáveis: ${CAMPANHA_VARIAVEIS.join(', ')}`;

/** "Aniversariantes do dia", "Origem: Instagram", "Compra nos últimos 30 dias". */
export function descreverFiltro(item: {
  filtro: CampanhaFiltro;
  origem: string | null;
  diasCompra: number | null;
}): string {
  if (item.filtro === 'ORIGEM') return `Origem: ${item.origem ?? '-'}`;
  if (item.filtro === 'COMPRA_RECENTE') return `Compra nos últimos ${item.diasCompra ?? 0} dias`;
  return CAMPANHA_FILTRO_ROTULO[item.filtro];
}

/** `[0, 1, 2]` → "Dom, Seg, Ter". */
export function descreverDias(dias: readonly number[]): string {
  return dias.map((dia) => abreviarDiaSemana(dia)).join(', ');
}
