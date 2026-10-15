/**
 * Máscaras dos formulários. O valor do campo guarda só os dígitos (CPF `12345678901`) e a
 * moeda guarda `number`; a formatação é só de exibição.
 */

export function apenasDigitos(valor: string): string {
  return valor.replaceAll(/\D/g, '');
}

/** Aplica um padrão (`#` = dígito) aos dígitos, parcialmente enquanto se digita. */
function aplicarPadrao(digitos: string, padrao: string): string {
  let resultado = '';
  let i = 0;
  for (const caractere of padrao) {
    if (i >= digitos.length) break;
    if (caractere === '#') {
      resultado += digitos[i];
      i += 1;
    } else {
      resultado += caractere;
    }
  }
  return resultado;
}

export interface Mascara {
  /** Quantidade máxima de dígitos. */
  maxDigitos: number;
  formatar: (digitos: string) => string;
}

const CPF = '###.###.###-##';
const CNPJ = '##.###.###/####-##';
const TELEFONE_FIXO = '(##) ####-####';
const CELULAR = '(##) #####-####';

export const MASCARAS = {
  cpf: { maxDigitos: 11, formatar: (d) => aplicarPadrao(d, CPF) },
  cnpj: { maxDigitos: 14, formatar: (d) => aplicarPadrao(d, CNPJ) },
  /** CPF até 11 dígitos; a partir do 12º, CNPJ. */
  'cpf-cnpj': {
    maxDigitos: 14,
    formatar: (d) => aplicarPadrao(d, d.length > 11 ? CNPJ : CPF),
  },
  /** Fixo com 10 dígitos; celular com 11. */
  telefone: {
    maxDigitos: 11,
    formatar: (d) => aplicarPadrao(d, d.length > 10 ? CELULAR : TELEFONE_FIXO),
  },
  cep: { maxDigitos: 8, formatar: (d) => aplicarPadrao(d, '#####-###') },
} as const satisfies Record<string, Mascara>;

export type TipoMascara = keyof typeof MASCARAS;

/** Dígitos do texto digitado, limitados ao tamanho da máscara. */
export function digitosDaMascara(tipo: TipoMascara, texto: string): string {
  return apenasDigitos(texto).slice(0, MASCARAS[tipo].maxDigitos);
}

export function formatarMascara(tipo: TipoMascara, valor: string | null | undefined): string {
  return MASCARAS[tipo].formatar(apenasDigitos(valor ?? ''));
}

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** `1234.5` → `R$ 1.234,50`. Vazio para `null`/`undefined`. */
export function formatarMoeda(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '' : MOEDA.format(valor);
}

/** Maior valor aceito pelo campo de moeda (15 dígitos, ainda exato em `number`). */
const MOEDA_MAX_DIGITOS = 15;

/**
 * Valor do campo de moeda a partir do texto digitado: os dígitos são centavos, como nas
 * maquininhas (`1`, `12`, `123` → `0,01`, `0,12`, `1,23`). Sem dígitos, `null`.
 */
export function moedaDoTexto(texto: string): number | null {
  const digitos = apenasDigitos(texto).replace(/^0+/, '').slice(0, MOEDA_MAX_DIGITOS);
  if (!digitos) return apenasDigitos(texto) ? 0 : null;
  return Number(digitos) / 100;
}
