import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';

/** Tom da pílula: Pago/Recebido verde, Pendente laranja, Cancelado e Vencido vermelho. */
const TOM_STATUS: Record<string, TomStatus> = {
  PENDENTE: 'alerta',
  PAGO: 'sucesso',
  RECEBIDO: 'sucesso',
  CANCELADO: 'perigo',
  VENCIDO: 'perigo',
};

export function StatusContaFinanceira({
  status,
  rotulos,
}: Readonly<{ status: string; rotulos: Readonly<Record<string, string>> }>) {
  return <StatusBadge tom={TOM_STATUS[status]}>{rotulos[status]}</StatusBadge>;
}
