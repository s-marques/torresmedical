import { PROFISSIONAL_CORES, type ProfissionalCor } from '@torres/shared';

export function iniciaisDe(nome: string): string {
  const palavras = nome.split(/\s+/).filter(Boolean);
  const letras = palavras.length > 1 ? [palavras[0], palavras.at(-1)] : [palavras[0]];
  return (
    letras
      .map((p) => p?.[0] ?? '')
      .join('')
      .toUpperCase() || '-'
  );
}

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** `600` → `R$ 600,00`; vazio → `-`. */
export function formatarValor(valor: number | null): string {
  return valor === null ? '-' : MOEDA.format(valor);
}

/** Comissão: `12.5` → `12,5%`; vazia ou 0 → `-` (como o detalhe do sistema atual). */
export function formatarComissao(comissao: number | null): string {
  return comissao ? `${String(comissao).replace('.', ',')}%` : '-';
}

export function corHex(cor: ProfissionalCor): string {
  return PROFISSIONAL_CORES[cor].hex;
}

/** `AAAA-MM-DD` → `DD/MM/AAAA`, sem passar por fuso horário. */
export function formatarData(data: string | null): string {
  if (!data) return '-';
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}
