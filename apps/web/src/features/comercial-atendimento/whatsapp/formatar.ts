const UM_DIA_MS = 24 * 60 * 60 * 1000;

function inicioDoDia(data: Date): number {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime();
}

/**
 * Hora da conversa na lista, como no sistema atual: `18:29` (hoje), `Ontem`, `sex.` (até
 * 6 dias atrás) e `07/10` (mais antiga).
 */
export function quandoDaConversa(data: Date, agora: Date = new Date()): string {
  const dias = Math.round((inicioDoDia(agora) - inicioDoDia(data)) / UM_DIA_MS);
  if (dias <= 0) {
    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (dias === 1) return 'Ontem';
  if (dias < 7) return data.toLocaleDateString('pt-BR', { weekday: 'short' });
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Iniciais do avatar: `Maria Souza` → `MS`; sem nome, `?`. */
export function iniciais(nome: string | null): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  const [primeira, ...resto] = partes;
  if (!primeira) return '?';
  const ultima = resto.at(-1);
  return `${primeira.charAt(0)}${ultima?.charAt(0) ?? ''}`.toUpperCase();
}

/** Badge de não lidas: acima de 9 vira `9+`. */
export function textoNaoLidas(naoLidas: number): string {
  return naoLidas > 9 ? '9+' : String(naoLidas);
}

/** Período inicial do modal: os últimos 30 dias, como no print do sistema atual. */
export const DIAS_PERIODO_ANUNCIOS = 30;

function dataLocal(data: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`;
}

export function periodoInicialAnuncios(hoje: Date = new Date()): { de: string; ate: string } {
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - DIAS_PERIODO_ANUNCIOS);
  return { de: dataLocal(inicio), ate: dataLocal(hoje) };
}
