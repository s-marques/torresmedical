import { useTranslation } from 'react-i18next';
import { ReportPage } from '@/components/shared/report-page/ReportPage';

/**
 * Relatórios de Estoque (`/estoque/relatorios`, docs/inventario/telas/compras-estoque-relatorios.md).
 * Os relatórios EST-01 a EST-14 vêm da API (`RelatoriosEstoque`).
 */
export default function RelatoriosEstoquePage() {
  const { t } = useTranslation();
  return (
    <ReportPage
      tela="compras-estoque.relatorios"
      titulo={t('relatoriosEstoque.titulo')}
      descricao={t('relatoriosEstoque.descricao')}
      breadcrumb={[
        { rotulo: t('relatoriosEstoque.painel'), para: '/' },
        { rotulo: t('relatoriosEstoque.modulo') },
        { rotulo: t('relatoriosEstoque.relatorios') },
      ]}
    />
  );
}
