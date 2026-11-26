import { CONTA_RECEBER_ROTULO_STATUS, CONTA_RECEBER_STATUS_MODAL } from '@torres/shared';
import type { OpcaoCampo } from '@/components/shared/form/tipos';

/**
 * Opções do combobox "Status" do modal "Nova/Editar Conta a Receber": A vencer, Pago e Cancelado.
 * Parcial e Renegociado só nascem das ações Baixar e Renegociar.
 */
export const OPCOES_STATUS: readonly OpcaoCampo[] = CONTA_RECEBER_STATUS_MODAL.map((status) => ({
  valor: status,
  rotulo: CONTA_RECEBER_ROTULO_STATUS[status],
}));
