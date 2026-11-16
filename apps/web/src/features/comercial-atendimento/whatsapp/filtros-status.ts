import type { ContadoresConversasWhatsapp, ConversaWhatsappStatus } from '@torres/shared';
import type { TomStatus } from '@/components/shared/StatusBadge';

/**
 * Chips de status da lista. "Alertas" não tem regra definida ainda (pendente com o dev):
 * mostra a lista vazia, sem consultar a API.
 */
export const FILTROS_STATUS = [
  { valor: 'bot', rotulo: 'Bot', contador: 'BOT' },
  { valor: 'aguardando', rotulo: 'Aguardando', contador: 'AGUARDANDO' },
  { valor: 'em-atendimento', rotulo: 'Em Atendimento', contador: 'EM_ATENDIMENTO' },
  { valor: 'alertas', rotulo: 'Alertas', contador: null },
  { valor: 'finalizada', rotulo: 'Finalizada', contador: 'FINALIZADA' },
] as const satisfies readonly {
  valor: string;
  rotulo: string;
  contador: keyof ContadoresConversasWhatsapp | null;
}[];

export type FiltroStatusConversa = (typeof FILTROS_STATUS)[number]['valor'];

/** Cor da badge de status da conversa (lista e cabeçalho do painel). */
export const TOM_STATUS: Readonly<Record<ConversaWhatsappStatus, TomStatus>> = {
  BOT: 'destaque',
  AGUARDANDO: 'alerta',
  EM_ATENDIMENTO: 'info',
  FINALIZADA: 'neutro',
};
