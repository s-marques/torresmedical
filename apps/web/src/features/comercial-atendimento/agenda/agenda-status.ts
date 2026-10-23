import type { AgendamentoStatus } from '@torres/shared';

/** Cores dos cartões e da legenda: Agendado azul, Confirmado verde, Check-in roxo, Cancelado vermelho, Reagendar laranja. */
export const COR_STATUS: Record<
  AgendamentoStatus,
  { fundo: string; ponto: string; pilula: string }
> = {
  AGENDADO: { fundo: 'bg-blue-500', ponto: 'bg-blue-500', pilula: 'bg-blue-500 text-white' },
  CONFIRMADO: {
    fundo: 'bg-emerald-600',
    ponto: 'bg-emerald-500',
    pilula: 'bg-emerald-500 text-white',
  },
  CHECK_IN: { fundo: 'bg-purple-500', ponto: 'bg-purple-500', pilula: 'bg-purple-500 text-white' },
  CANCELADO: { fundo: 'bg-red-500', ponto: 'bg-red-500', pilula: 'bg-red-500 text-white' },
  REAGENDAR: { fundo: 'bg-orange-500', ponto: 'bg-orange-500', pilula: 'bg-orange-500 text-white' },
  ATENDIDO: { fundo: 'bg-slate-500', ponto: 'bg-slate-500', pilula: 'bg-slate-500 text-white' },
  FALTOU: { fundo: 'bg-amber-500', ponto: 'bg-amber-500', pilula: 'bg-amber-500 text-white' },
};
