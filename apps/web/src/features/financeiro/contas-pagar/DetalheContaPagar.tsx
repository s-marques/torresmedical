import {
  CONTA_PAGAR_ROTULO_STATUS_EXIBICAO,
  statusExibicaoContaPagar,
  type ContaPagar,
  type ContaPagarStatusExibicao,
} from '@torres/shared';
import { BanknoteIcon, PencilIcon, XCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { useBaixasContaPagar } from './use-contas-pagar';

function Item({ rotulo, children }: Readonly<{ rotulo: string; children: ReactNode }>) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium break-words">{children || '-'}</dd>
    </div>
  );
}

const TOM_STATUS: Record<ContaPagarStatusExibicao, 'sucesso' | 'alerta' | 'perigo'> = {
  PENDENTE: 'alerta',
  PAGO: 'sucesso',
  CANCELADO: 'perigo',
  VENCIDO: 'perigo',
};

export interface DetalheContaPagarProps {
  conta: ContaPagar;
  onFechar: () => void;
  onEditar: () => void;
  onBaixar: () => void;
  onCancelarBaixa: () => void;
}

/** Modal de detalhe (clique na linha ou "Detalhar" no menu de ações). */
export function DetalheContaPagar({
  conta: c,
  onFechar,
  onEditar,
  onBaixar,
  onCancelarBaixa,
}: Readonly<DetalheContaPagarProps>) {
  const status = statusExibicaoContaPagar(c);
  const baixas = useBaixasContaPagar(c.id);
  const temBaixa = (baixas.data?.length ?? 0) > 0;

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={c.descricao}
      tamanho="lg"
      rodape={
        <>
          <Button type="button" variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          <SePermitido permissao="financeiro.contas-pagar.editar">
            {temBaixa && (
              <Button type="button" variant="outline" onClick={onCancelarBaixa}>
                <XCircleIcon aria-hidden />
                Cancelar Baixa
              </Button>
            )}
            {c.status === 'PENDENTE' && (
              <Button type="button" variant="outline" onClick={onBaixar}>
                <BanknoteIcon aria-hidden />
                Baixar
              </Button>
            )}
            <Button type="button" onClick={onEditar}>
              <PencilIcon aria-hidden />
              Editar
            </Button>
          </SePermitido>
        </>
      }
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        <Item rotulo="Fornecedor / Funcionário">{c.beneficiarioNome}</Item>
        <Item rotulo="Valor">{formatarMoeda(Number(c.valor))}</Item>
        <Item rotulo="Data de Vencimento">{formatarData(c.dataVencimento)}</Item>
        <Item rotulo="Status">
          <StatusBadge tom={TOM_STATUS[status]}>
            {CONTA_PAGAR_ROTULO_STATUS_EXIBICAO[status]}
          </StatusBadge>
        </Item>
        <Item rotulo="Valor Pago">{formatarMoeda(Number(c.valorPago))}</Item>
        <Item rotulo="Forma de Pagamento">{c.formaPagamentoNome}</Item>
        <Item rotulo="Plano de Contas">{c.planoContaNome}</Item>
        <Item rotulo="Documento">{c.documento}</Item>
        <Item rotulo="Total Parcelas">{c.totalParcelas}</Item>
        <Item rotulo="Observações">{c.observacoes}</Item>
      </dl>
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
    </Modal>
  );
}
