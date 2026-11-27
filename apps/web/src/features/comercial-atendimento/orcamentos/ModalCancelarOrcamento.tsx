import {
  cancelarSemReagendamentoSchema,
  type CancelarSemReagendamentoFormulario,
  type CancelarSemReagendamentoInput,
  type Orcamento,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { ModalCancelamento } from '@/components/shared/cancelamento/ModalCancelamento';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { useCancelarOrcamento } from './use-orcamentos';

export interface ModalCancelarOrcamentoProps {
  orcamento: Orcamento;
  onFechar: () => void;
}

/**
 * Cancelamento do orçamento (issue #162, tipo "proposta"): motivo da lista obrigatório; o
 * orçamento não é excluído, fica cancelado com quem, quando e o motivo.
 */
export function ModalCancelarOrcamento({
  orcamento,
  onFechar,
}: Readonly<ModalCancelarOrcamentoProps>) {
  const { t } = useTranslation();
  const cancelar = useCancelarOrcamento(orcamento.id);
  const form = useFormulario<CancelarSemReagendamentoFormulario, CancelarSemReagendamentoInput>(
    cancelarSemReagendamentoSchema,
    { defaultValues: { motivoId: '', observacao: '' } },
  );
  return (
    <ModalCancelamento
      tipo="PROPOSTA"
      titulo={t('cancelamento.orcamento.titulo', { numero: orcamento.numero })}
      descricao={t('cancelamento.orcamento.descricao')}
      rotuloConfirmar={t('cancelamento.orcamento.confirmar')}
      form={form}
      onConfirmar={(valores) => cancelar.mutateAsync(valores)}
      onFechar={onFechar}
    />
  );
}
