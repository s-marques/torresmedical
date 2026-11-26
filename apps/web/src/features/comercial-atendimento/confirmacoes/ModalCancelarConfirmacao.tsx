import {
  cancelarSemReagendamentoSchema,
  type CancelarSemReagendamentoFormulario,
  type CancelarSemReagendamentoInput,
  type Confirmacao,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { ModalCancelamento } from '@/components/shared/cancelamento/ModalCancelamento';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { formatarDataHoraCurta } from './formatar';
import { useCancelarConfirmacao } from './use-confirmacoes';

export interface ModalCancelarConfirmacaoProps {
  confirmacao: Confirmacao;
  onFechar: () => void;
}

/**
 * "Cancelar" (✗) da aba Pendentes: como na Agenda, a consulta só é cancelada com o motivo da lista
 * (issue #162, R §34), e o horário é liberado.
 */
export function ModalCancelarConfirmacao({
  confirmacao,
  onFechar,
}: Readonly<ModalCancelarConfirmacaoProps>) {
  const { t } = useTranslation();
  const cancelar = useCancelarConfirmacao(confirmacao.id);
  const form = useFormulario<CancelarSemReagendamentoFormulario, CancelarSemReagendamentoInput>(
    cancelarSemReagendamentoSchema,
    { defaultValues: { motivoId: '', observacao: '' } },
  );
  return (
    <ModalCancelamento
      tipo="CONSULTA"
      titulo={t('cancelamento.agenda.titulo', { numero: confirmacao.numero })}
      descricao={t('cancelamento.confirmacao.descricao', {
        paciente: confirmacao.paciente,
        profissional: confirmacao.profissional,
        quando: formatarDataHoraCurta(confirmacao.inicio),
      })}
      rotuloConfirmar={t('cancelamento.agenda.confirmar')}
      form={form}
      onConfirmar={(valores) => cancelar.mutateAsync(valores)}
      onFechar={onFechar}
    />
  );
}
