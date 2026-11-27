import { useTranslation } from 'react-i18next';
import { ReportPage } from '@/components/shared/report-page/ReportPage';

/**
 * Relatórios do Financeiro (`/financeiro/relatorios`, docs/inventario/telas/financeiro-relatorios.md).
 * Os relatórios FIN-xx vêm da API (`RelatoriosFinanceiro`).
 */
export default function RelatoriosFinanceiroPage() {
  const { t } = useTranslation();
  return (
    <ReportPage
      tela="financeiro.relatorios"
      titulo={t('relatoriosFinanceiro.titulo')}
      descricao={t('relatoriosFinanceiro.descricao')}
      breadcrumb={[
        { rotulo: t('relatoriosFinanceiro.painel'), para: '/' },
        { rotulo: t('relatoriosFinanceiro.modulo') },
        { rotulo: t('relatoriosFinanceiro.relatorios') },
      ]}
    />
  );
}
