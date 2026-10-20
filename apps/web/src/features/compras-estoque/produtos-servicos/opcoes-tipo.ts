import { PRODUTO_TIPO_ROTULOS, PRODUTO_TIPOS, type ProdutoTipo } from '@torres/shared';

/** Opções do campo Tipo do modal: Produto, Revenda, Uso e Consumo e Serviço. */
export const OPCOES_TIPO_PRODUTO = PRODUTO_TIPOS.map((valor) => ({
  valor,
  rotulo: PRODUTO_TIPO_ROTULOS[valor],
}));

/** Tipo da API (`USO_CONSUMO`) → valor do formulário (`uso-consumo`). */
export function tipoDoFormulario(tipo: string): ProdutoTipo {
  return tipo.toLowerCase().replaceAll('_', '-') as ProdutoTipo;
}
