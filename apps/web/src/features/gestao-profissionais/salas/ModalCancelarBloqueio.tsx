import {
  cancelarSalaBloqueioSchema,
  type CancelarSalaBloqueioFormulario,
  type CancelarSalaBloqueioInput,
  type SalaBloqueio,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { ModalCancelamento } from '@/components/shared/cancelamento/ModalCancelamento';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { periodoDoBloqueio } from './periodo-bloqueio';
import { useCancelarBloqueio } from './use-bloqueios-sala';

export interface ModalCancelarBloqueioProps {
  bloqueio: SalaBloqueio;
  onFechar: () => void;
}

/**
 * Cancelamento do período (ação destrutiva) com o motivo da lista (issue #162). O bloqueio não é
 * excluído: fica cancelado, com quem, quando e o motivo (critério de aceite da #138).
 */
export function ModalCancelarBloqueio({
  bloqueio,
  onFechar,
}: Readonly<ModalCancelarBloqueioProps>) {
  const { t } = useTranslation();
  const cancelar = useCancelarBloqueio(bloqueio.id);
  const form = useFormulario<CancelarSalaBloqueioFormulario, CancelarSalaBloqueioInput>(
    cancelarSalaBloqueioSchema,
    { defaultValues: { motivoId: '', observacao: '' } },
  );

  return (
    <ModalCancelamento
      tipo="PERIODO"
      titulo={t('salasBloqueios.cancelar.titulo')}
      descricao={t('salasBloqueios.cancelar.descricao', {
        tipo: t(`salasBloqueios.tipos.${bloqueio.tipo}`),
        sala: bloqueio.salaNome,
        periodo: periodoDoBloqueio(bloqueio, t('salasBloqueios.ate')),
      })}
      rotuloConfirmar={t('salasBloqueios.cancelar.confirmar')}
      form={form}
      onConfirmar={(valores) => cancelar.mutateAsync(valores)}
      onFechar={onFechar}
    />
  );
}
