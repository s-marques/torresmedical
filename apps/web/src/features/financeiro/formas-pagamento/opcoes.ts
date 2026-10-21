import { FORMA_PAGAMENTO_ROTULO_TIPO, FORMA_PAGAMENTO_TIPOS } from '@torres/shared';

/** Combo Finalidade do modal. "Vendas / Recebimento" é o texto do sistema atual. */
export const OPCOES_FINALIDADE = [
  { valor: 'receber', rotulo: 'Vendas / Recebimento' },
  { valor: 'pagar', rotulo: 'Compras / Pagamento' },
] as const;

/** Combo Tipo do modal: o valor da API (minúsculo) com o rótulo do grid. */
export const OPCOES_TIPO = FORMA_PAGAMENTO_TIPOS.map((valor) => ({
  valor,
  rotulo:
    FORMA_PAGAMENTO_ROTULO_TIPO[valor.toUpperCase() as keyof typeof FORMA_PAGAMENTO_ROTULO_TIPO],
}));
