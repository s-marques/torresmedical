const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Data da API para exibição (`31/10/2026`). "-" quando vazia ou inválida. */
export function formatarData(valor: string | null | undefined): string {
  return formatarCom(DATA, valor);
}

/** Data/hora ISO da API para exibição (`31/10/2026, 14:03`), no fuso do navegador. */
export function formatarDataHora(valor: string | null | undefined): string {
  return formatarCom(DATA_HORA, valor);
}

function formatarCom(formato: Intl.DateTimeFormat, valor: string | null | undefined): string {
  if (!valor) return '-';
  // `AAAA-MM-DD` é um dia do calendário: lido no fuso local, para não voltar um dia.
  const partes = SO_DATA.exec(valor);
  const data = partes
    ? new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))
    : new Date(valor);
  return Number.isNaN(data.getTime()) ? '-' : formato.format(data);
}

/** Iniciais do primeiro e do último nome: "Ana Maria Souza" → "AS". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '';
  return `${primeira}${ultima}`.toUpperCase() || '?';
}
