import type { SalaBloqueio } from '@torres/shared';
import { formatarData } from '@/lib/formatar';

/** Período no idioma do usuário: "10/12/2026" ou "10/12/2026 a 12/12/2026". */
export function periodoDoBloqueio(
  bloqueio: Pick<SalaBloqueio, 'dataInicio' | 'dataFim'>,
  conectivo: string,
): string {
  return bloqueio.dataInicio === bloqueio.dataFim
    ? formatarData(bloqueio.dataInicio)
    : `${formatarData(bloqueio.dataInicio)} ${conectivo} ${formatarData(bloqueio.dataFim)}`;
}
