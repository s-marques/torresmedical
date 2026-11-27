import {
  CONTA_RECEBER_ROTULO_STATUS_EXIBICAO,
  statusExibicaoContaReceber,
  type ContaReceber,
} from '@torres/shared';
import { BanknoteIcon, HandshakeIcon, XCircleIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SePermitido } from '@/components/shared/SePermitido';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { DetalheContaFinanceira, ItemDetalhe } from '../contas-financeiras/DetalheContaFinanceira';
import { HistoricoCobrancasTitulo } from '../inadimplencia/HistoricoCobrancasTitulo';
import { formatarCompetencia } from '../contas-pagar/regras-conta-pagar';
import { contaComBaixaCancelavel, contaComSaldoEmAberto } from './regras-conta-receber';
import { useBaixasContaReceber } from './use-contas-receber';

export interface DetalheContaReceberProps {
  conta: ContaReceber;
  onFechar: () => void;
  onEditar: () => void;
  onBaixar: () => void;
  onCancelarBaixa: () => void;
  onRenegociar: () => void;
}

/** Modal de detalhe (clique na linha ou "Detalhar" no menu de ações). */
export function DetalheContaReceber({
  conta,
  onFechar,
  onEditar,
  onBaixar,
  onCancelarBaixa,
  onRenegociar,
}: Readonly<DetalheContaReceberProps>) {
  const { t } = useTranslation();
  const baixas = useBaixasContaReceber(conta.id);
  const temBaixa = (baixas.data?.length ?? 0) > 0;

  return (
    <DetalheContaFinanceira
      conta={conta}
      status={statusExibicaoContaReceber(conta)}
      rotulosStatus={CONTA_RECEBER_ROTULO_STATUS_EXIBICAO}
      pessoa={
        <>
          <ItemDetalhe rotulo="Cliente">{conta.pacienteNome}</ItemDetalhe>
          {conta.profissionalSacadoId && (
            <ItemDetalhe rotulo={t('contasReceber.detalhe.profissional')}>
              {conta.profissionalSacadoNome}
            </ItemDetalhe>
          )}
        </>
      }
      itensExtras={
        <>
          <ItemDetalhe rotulo={t('contasReceber.detalhe.contrato')}>
            {conta.contratoSalaNumero === null ? null : `#${conta.contratoSalaNumero}`}
          </ItemDetalhe>
          <ItemDetalhe rotulo={t('contasReceber.detalhe.competencia')}>
            {formatarCompetencia(conta.competencia)}
          </ItemDetalhe>
          <ItemDetalhe rotulo={t('contasReceber.detalhe.valorRecebido')}>
            {formatarMoeda(Number(conta.valorRecebido))}
          </ItemDetalhe>
          <ItemDetalhe rotulo={t('contasReceber.detalhe.saldo')}>
            {formatarMoeda(Number(conta.saldo))}
          </ItemDetalhe>
          {conta.renegociadoDeNumero !== null && (
            <ItemDetalhe rotulo={t('contasReceber.detalhe.renegociadoDe')}>
              {`#${conta.renegociadoDeNumero}`}
            </ItemDetalhe>
          )}
          {conta.renegociadoParaNumeros.length > 0 && (
            <ItemDetalhe rotulo={t('contasReceber.detalhe.renegociadoPara')}>
              {conta.renegociadoParaNumeros.map((n) => `#${n}`).join(', ')}
            </ItemDetalhe>
          )}
          {conta.dataRecebimento && (
            <>
              <ItemDetalhe rotulo="Conta Bancária">{conta.contaBancariaNome}</ItemDetalhe>
              <ItemDetalhe rotulo="Data de Recebimento">
                {formatarData(conta.dataRecebimento)}
              </ItemDetalhe>
            </>
          )}
        </>
      }
      permissaoEditar="financeiro.contas-receber.editar"
      acoesExtras={
        <>
          {contaComBaixaCancelavel(conta) && (
            <Button type="button" variant="outline" onClick={onCancelarBaixa}>
              <XCircleIcon aria-hidden />
              {t('contasReceber.acoes.cancelarBaixa')}
            </Button>
          )}
          {contaComSaldoEmAberto(conta) && (
            <>
              <Button type="button" variant="outline" onClick={onRenegociar}>
                <HandshakeIcon aria-hidden />
                {t('contasReceber.acoes.renegociar')}
              </Button>
              <Button type="button" variant="outline" onClick={onBaixar}>
                <BanknoteIcon aria-hidden />
                {t('contasReceber.acoes.baixar')}
              </Button>
            </>
          )}
        </>
      }
      tamanho="lg"
      onFechar={onFechar}
      onEditar={onEditar}
    >
      {temBaixa && (
        <div className="mt-4 grid gap-2">
          <h3 className="text-sm font-medium">{t('contasReceber.detalhe.baixas')}</h3>
          <div className="overflow-x-auto rounded-lg border text-sm">
            <table className="w-full">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('contasReceber.detalhe.baixaData')}</th>
                  <th className="px-3 py-2 font-medium">{t('contasReceber.detalhe.baixaValor')}</th>
                  <th className="px-3 py-2 font-medium">{t('contasReceber.detalhe.baixaForma')}</th>
                  <th className="px-3 py-2 font-medium">{t('contasReceber.detalhe.baixaConta')}</th>
                  <th className="px-3 py-2 font-medium">
                    {t('contasReceber.detalhe.baixaRegistrada')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {baixas.data?.map((baixa) => (
                  <tr key={baixa.id} className="border-t">
                    <td className="px-3 py-2">{formatarData(baixa.dataRecebimento)}</td>
                    <td className="px-3 py-2">{formatarMoeda(Number(baixa.valorRecebido))}</td>
                    <td className="px-3 py-2">{baixa.formaPagamentoNome ?? '-'}</td>
                    <td className="px-3 py-2">{baixa.contaBancariaNome ?? '-'}</td>
                    <td className="px-3 py-2">{formatarDataHora(baixa.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {conta.profissionalSacadoId && (
        <SePermitido permissao="financeiro.inadimplencia.ver">
          <HistoricoCobrancasTitulo contaReceberId={conta.id} />
        </SePermitido>
      )}
    </DetalheContaFinanceira>
  );
}
