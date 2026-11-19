import { statusExibicaoContaReceber, type ReceitaProfissional } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { formatarData } from '@/lib/formatar';
import {
  DetalheContaFinanceira,
  ItemDetalhe,
} from '../../financeiro/contas-financeiras/DetalheContaFinanceira';
import { useRotulosStatusReceita } from './rotulos-status';

export interface DetalheReceitaProps {
  receita: ReceitaProfissional;
  onFechar: () => void;
  onEditar: () => void;
}

/** Modal de detalhe (clique na linha ou "Detalhar" no menu de ações). */
export function DetalheReceita({ receita, onFechar, onEditar }: Readonly<DetalheReceitaProps>) {
  const { t } = useTranslation();
  const rotulosStatus = useRotulosStatusReceita();
  return (
    <DetalheContaFinanceira
      conta={receita}
      status={statusExibicaoContaReceber(receita)}
      rotulosStatus={rotulosStatus}
      pessoa={
        <>
          <ItemDetalhe rotulo={t('receitaProfissionais.profissional')}>
            {receita.profissionalNome}
          </ItemDetalhe>
          <ItemDetalhe rotulo={t('receitaProfissionais.paciente')}>
            {receita.pacienteNome}
          </ItemDetalhe>
        </>
      }
      itensExtras={
        receita.status === 'RECEBIDO' && (
          <>
            <ItemDetalhe rotulo={t('receitaProfissionais.contaBancaria')}>
              {receita.contaBancariaNome}
            </ItemDetalhe>
            <ItemDetalhe rotulo={t('receitaProfissionais.dataRecebimento')}>
              {formatarData(receita.dataRecebimento)}
            </ItemDetalhe>
          </>
        )
      }
      permissaoEditar="gestao-profissionais.receita-profissionais.editar"
      onFechar={onFechar}
      onEditar={onEditar}
    />
  );
}
