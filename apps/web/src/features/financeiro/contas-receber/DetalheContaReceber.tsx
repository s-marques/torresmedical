import {
  CONTA_RECEBER_ROTULO_STATUS_EXIBICAO,
  statusExibicaoContaReceber,
  type ContaReceber,
} from '@torres/shared';
import { formatarData } from '@/lib/formatar';
import { DetalheContaFinanceira, ItemDetalhe } from '../contas-financeiras/DetalheContaFinanceira';

export interface DetalheContaReceberProps {
  conta: ContaReceber;
  onFechar: () => void;
  onEditar: () => void;
}

/** Modal de detalhe (clique na linha ou "Detalhar" no menu de ações). */
export function DetalheContaReceber({
  conta,
  onFechar,
  onEditar,
}: Readonly<DetalheContaReceberProps>) {
  return (
    <DetalheContaFinanceira
      conta={conta}
      status={statusExibicaoContaReceber(conta)}
      rotulosStatus={CONTA_RECEBER_ROTULO_STATUS_EXIBICAO}
      pessoa={<ItemDetalhe rotulo="Cliente">{conta.pacienteNome}</ItemDetalhe>}
      itensExtras={
        conta.status === 'RECEBIDO' && (
          <>
            <ItemDetalhe rotulo="Conta Bancária">{conta.contaBancariaNome}</ItemDetalhe>
            <ItemDetalhe rotulo="Data de Recebimento">
              {formatarData(conta.dataRecebimento)}
            </ItemDetalhe>
          </>
        )
      }
      permissaoEditar="financeiro.contas-receber.editar"
      onFechar={onFechar}
      onEditar={onEditar}
    />
  );
}
