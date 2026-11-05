import {
  CONTA_PAGAR_ROTULO_STATUS_EXIBICAO,
  statusExibicaoContaPagar,
  type ContaPagar,
} from '@torres/shared';
import { BanknoteIcon, XCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { DetalheContaFinanceira, ItemDetalhe } from '../contas-financeiras/DetalheContaFinanceira';
import { useBaixasContaPagar } from './use-contas-pagar';

export interface DetalheContaPagarProps {
  conta: ContaPagar;
  onFechar: () => void;
  onEditar: () => void;
  onBaixar: () => void;
  onCancelarBaixa: () => void;
}

/** Modal de detalhe (clique na linha ou "Detalhar" no menu de ações). */
export function DetalheContaPagar({
  conta,
  onFechar,
  onEditar,
  onBaixar,
  onCancelarBaixa,
}: Readonly<DetalheContaPagarProps>) {
  const baixas = useBaixasContaPagar(conta.id);
  const temBaixa = (baixas.data?.length ?? 0) > 0;

  return (
    <DetalheContaFinanceira
      conta={conta}
      status={statusExibicaoContaPagar(conta)}
      rotulosStatus={CONTA_PAGAR_ROTULO_STATUS_EXIBICAO}
      pessoa={<ItemDetalhe rotulo="Fornecedor / Funcionário">{conta.beneficiarioNome}</ItemDetalhe>}
      itensExtras={
        <ItemDetalhe rotulo="Valor Pago">{formatarMoeda(Number(conta.valorPago))}</ItemDetalhe>
      }
      permissaoEditar="financeiro.contas-pagar.editar"
      acoesExtras={
        <>
          {temBaixa && (
            <Button type="button" variant="outline" onClick={onCancelarBaixa}>
              <XCircleIcon aria-hidden />
              Cancelar Baixa
            </Button>
          )}
          {conta.status === 'PENDENTE' && (
            <Button type="button" variant="outline" onClick={onBaixar}>
              <BanknoteIcon aria-hidden />
              Baixar
            </Button>
          )}
        </>
      }
      tamanho="lg"
      onFechar={onFechar}
      onEditar={onEditar}
    >
      {temBaixa && (
        <div className="mt-4 grid gap-2">
          <h3 className="text-sm font-medium">Baixas</h3>
          <div className="overflow-x-auto rounded-lg border text-sm">
            <table className="w-full">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Valor Pago</th>
                  <th className="px-3 py-2 font-medium">Forma de Pagamento</th>
                  <th className="px-3 py-2 font-medium">Registrado em</th>
                </tr>
              </thead>
              <tbody>
                {baixas.data?.map((baixa) => (
                  <tr key={baixa.id} className="border-t">
                    <td className="px-3 py-2">{formatarData(baixa.dataPagamento)}</td>
                    <td className="px-3 py-2">{formatarMoeda(Number(baixa.valorPago))}</td>
                    <td className="px-3 py-2">{baixa.formaPagamentoNome ?? '-'}</td>
                    <td className="px-3 py-2">{formatarDataHora(baixa.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DetalheContaFinanceira>
  );
}
