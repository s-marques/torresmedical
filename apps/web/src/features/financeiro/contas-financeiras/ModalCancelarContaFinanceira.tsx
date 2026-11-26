import {
  cancelarSemReagendamentoSchema,
  type CancelarSemReagendamentoFormulario,
  type CancelarSemReagendamentoInput,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { ModalCancelamento } from '@/components/shared/cancelamento/ModalCancelamento';
import { useFormulario } from '@/components/shared/form/use-formulario';

export interface ModalCancelarContaFinanceiraProps {
  /** Qual tela: define os textos (`cancelamento.contaReceber.*` ou `cancelamento.contaPagar.*`). */
  tela: 'contaReceber' | 'contaPagar';
  /** Descrição da conta, no texto do modal. */
  descricao: string;
  /** Chama a API (`POST …/:id/cancelar`). */
  onCancelar: (dados: CancelarSemReagendamentoInput) => Promise<unknown>;
  onFechar: () => void;
}

/**
 * Cancelamento de Conta a Receber ou a Pagar (issue #162, tipo "cobrança"): motivo da lista
 * obrigatório; a conta não é excluída, fica cancelada com quem, quando e o motivo.
 */
export function ModalCancelarContaFinanceira({
  tela,
  descricao,
  onCancelar,
  onFechar,
}: Readonly<ModalCancelarContaFinanceiraProps>) {
  const { t } = useTranslation();
  const form = useFormulario<CancelarSemReagendamentoFormulario, CancelarSemReagendamentoInput>(
    cancelarSemReagendamentoSchema,
    { defaultValues: { motivoId: '', observacao: '' } },
  );
  return (
    <ModalCancelamento
      tipo="COBRANCA"
      titulo={t(`cancelamento.${tela}.titulo`)}
      descricao={t(`cancelamento.${tela}.descricao`, { descricao })}
      rotuloConfirmar={t(`cancelamento.${tela}.confirmar`)}
      form={form}
      onConfirmar={onCancelar}
      onFechar={onFechar}
    />
  );
}
