import type { ContaReceber } from '@torres/shared';
import { ModalCancelarContaFinanceira } from '../contas-financeiras/ModalCancelarContaFinanceira';
import { useCancelarContaReceber } from './use-contas-receber';

/** "Cancelar" da linha de Contas a Receber, com o motivo da lista (issue #162). */
export function ModalCancelarContaReceber({
  conta,
  onFechar,
}: Readonly<{ conta: ContaReceber; onFechar: () => void }>) {
  const cancelar = useCancelarContaReceber(conta.id);
  return (
    <ModalCancelarContaFinanceira
      tela="contaReceber"
      descricao={conta.descricao}
      onCancelar={(dados) => cancelar.mutateAsync(dados)}
      onFechar={onFechar}
    />
  );
}
