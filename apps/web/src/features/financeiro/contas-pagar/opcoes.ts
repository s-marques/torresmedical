import { CONTA_PAGAR_ROTULO_STATUS, CONTA_PAGAR_STATUS } from '@torres/shared';
import type { OpcaoCampo } from '@/components/shared/form/tipos';

/** Opções do combobox "Status" do modal "Nova/Editar Conta a Pagar". */
export const OPCOES_STATUS: readonly OpcaoCampo[] = CONTA_PAGAR_STATUS.map((status) => ({
  valor: status,
  rotulo: CONTA_PAGAR_ROTULO_STATUS[status],
}));
