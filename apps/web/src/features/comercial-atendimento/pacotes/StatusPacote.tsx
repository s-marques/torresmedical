import { PACOTE_ROTULO_STATUS, type PacoteStatus } from '@torres/shared';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';

const TOM_STATUS: Record<PacoteStatus, TomStatus> = {
  ATIVO: 'sucesso',
  FINALIZADO: 'info',
  VENCIDO: 'alerta',
  CANCELADO: 'perigo',
};

export function StatusPacote({ status }: Readonly<{ status: PacoteStatus }>) {
  return <StatusBadge tom={TOM_STATUS[status]}>{PACOTE_ROTULO_STATUS[status]}</StatusBadge>;
}

/** Barra de progresso do uso das sessões (`usadas` de `total`). */
export function BarraSessoes({
  usadas,
  total,
  rotulo,
  className = 'h-2 w-full',
}: Readonly<{ usadas: number; total: number; rotulo: string; className?: string }>) {
  const percentual = total > 0 ? Math.min(100, Math.round((usadas / total) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={usadas}
      className={`overflow-hidden rounded-full bg-muted ${className}`}
    >
      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percentual}%` }} />
    </div>
  );
}
