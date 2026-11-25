import {
  CONTA_PAGAR_ROTULO_STATUS_EXIBICAO,
  statusExibicaoContaPagar,
  type ContaPagar,
} from '@torres/shared';
import { BanknoteIcon, XCircleIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useLinkArquivo } from '@/hooks/use-link-arquivo';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { DetalheContaFinanceira, ItemDetalhe } from '../contas-financeiras/DetalheContaFinanceira';
import { formatarCompetencia } from './regras-conta-pagar';
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
  const { t } = useTranslation();
  const documento = useLinkArquivo(conta.documentoArquivoId);
  const baixas = useBaixasContaPagar(conta.id);
  const temBaixa = (baixas.data?.length ?? 0) > 0;

  return (
    <DetalheContaFinanceira
      conta={conta}
      status={statusExibicaoContaPagar(conta)}
      rotulosStatus={CONTA_PAGAR_ROTULO_STATUS_EXIBICAO}
      pessoa={<ItemDetalhe rotulo="Fornecedor / Funcionário">{conta.beneficiarioNome}</ItemDetalhe>}
      itensExtras={
        <>
          <ItemDetalhe rotulo="Valor Pago">{formatarMoeda(Number(conta.valorPago))}</ItemDetalhe>
          <ItemDetalhe rotulo={t('contasPagar.detalhe.competencia')}>
            {formatarCompetencia(conta.competencia)}
          </ItemDetalhe>
          <ItemDetalhe rotulo={t('contasPagar.detalhe.centroCusto')}>
            {conta.centroCustoNome}
          </ItemDetalhe>
          <ItemDetalhe rotulo={t('contasPagar.detalhe.documento')}>
            {documento.data && (
              <a
                href={documento.data.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                {t('contasPagar.detalhe.verDocumento')}
              </a>
            )}
          </ItemDetalhe>
        </>
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
                  <th className="px-3 py-2 font-medium">
                    {t('contasPagar.detalhe.baixaDivergencia')}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t('contasPagar.detalhe.baixaJustificativa')}
                  </th>
                  <th className="px-3 py-2 font-medium">Registrado em</th>
                </tr>
              </thead>
              <tbody>
                {baixas.data?.map((baixa) => (
                  <tr key={baixa.id} className="border-t">
                    <td className="px-3 py-2">{formatarData(baixa.dataPagamento)}</td>
                    <td className="px-3 py-2">{formatarMoeda(Number(baixa.valorPago))}</td>
                    <td className="px-3 py-2">{baixa.formaPagamentoNome ?? '-'}</td>
                    <td className="px-3 py-2">
                      {baixa.divergencia ? formatarMoeda(Number(baixa.divergencia)) : '-'}
                    </td>
                    <td className="px-3 py-2">{baixa.justificativaDivergencia ?? '-'}</td>
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
