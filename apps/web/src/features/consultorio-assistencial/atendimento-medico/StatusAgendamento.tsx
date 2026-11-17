import { AGENDAMENTO_STATUS_ROTULOS, type AgendamentoStatus } from '@torres/shared';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';

/** Cores dos prints: Agendado cinza, Confirmado amarelo, Cancelado vermelho, Em Atendimento azul. */
const TOM: Record<AgendamentoStatus, TomStatus> = {
  AGENDADO: 'neutro',
  CONFIRMADO: 'alerta',
  CHECK_IN: 'destaque',
  AGUARDANDO: 'destaque',
  EM_ATENDIMENTO: 'info',
  ATENDIDO: 'sucesso',
  CANCELADO: 'perigo',
  REAGENDAR: 'alerta',
  FALTOU: 'perigo',
};

export function StatusAgendamento({ status }: Readonly<{ status: AgendamentoStatus }>) {
  return <StatusBadge tom={TOM[status]}>{AGENDAMENTO_STATUS_ROTULOS[status]}</StatusBadge>;
}

/** Coluna "Pgto": vazia para agendamento cancelado. */
export function StatusPagamento({
  pago,
  status,
}: Readonly<{ pago: boolean; status: AgendamentoStatus }>) {
  if (status === 'CANCELADO') return null;
  return <StatusBadge tom={pago ? 'sucesso' : 'perigo'}>{pago ? 'Pago' : 'Não Pago'}</StatusBadge>;
}
