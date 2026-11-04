import { CONTA_RECEBER_ROTULO_STATUS, CONTA_RECEBER_STATUS } from '@torres/shared';
import type { OpcaoCampo } from '@/components/shared/form/tipos';

/** Opções do combobox "Status" do modal "Nova/Editar Conta a Receber". */
export const OPCOES_STATUS: readonly OpcaoCampo[] = CONTA_RECEBER_STATUS.map((status) => ({
  valor: status,
  rotulo: CONTA_RECEBER_ROTULO_STATUS[status],
}));
