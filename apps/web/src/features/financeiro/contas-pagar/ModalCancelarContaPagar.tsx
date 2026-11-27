import type { ContaPagar } from '@torres/shared';
import { ModalCancelarContaFinanceira } from '../contas-financeiras/ModalCancelarContaFinanceira';
import { useCancelarContaPagar } from './use-contas-pagar';

/** "Cancelar" da linha de Contas a Pagar, com o motivo da lista (issue #162). */
export function ModalCancelarContaPagar({
  conta,
  onFechar,
}: Readonly<{ conta: ContaPagar; onFechar: () => void }>) {
  const cancelar = useCancelarContaPagar(conta.id);
  return (
    <ModalCancelarContaFinanceira
      tela="contaPagar"
      descricao={conta.descricao}
      onCancelar={(dados) => cancelar.mutateAsync(dados)}
      onFechar={onFechar}
    />
  );
}
