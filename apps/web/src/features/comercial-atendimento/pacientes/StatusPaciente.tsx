import { PACIENTE_STATUS_ROTULOS, type PacienteStatus } from '@torres/shared';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';

const TONS: Record<PacienteStatus, TomStatus> = {
  NOVO: 'info',
  ATIVO: 'sucesso',
  INATIVO: 'perigo',
};

export function StatusPaciente({ status }: Readonly<{ status: PacienteStatus }>) {
  return <StatusBadge tom={TONS[status]}>{PACIENTE_STATUS_ROTULOS[status]}</StatusBadge>;
}
