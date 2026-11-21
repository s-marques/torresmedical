import { useTranslation } from 'react-i18next';
import { ReportPage } from '@/components/shared/report-page/ReportPage';

/**
 * Relatórios Comerciais (`/crm/relatorios`, docs/inventario/telas/comercial-atendimento-relatorios.md).
 * Os relatórios COM-01 a COM-04 vêm da API (`RelatoriosComercial`).
 */
export default function RelatoriosComercialPage() {
  const { t } = useTranslation();
  return (
    <ReportPage
      tela="comercial-atendimento.relatorios"
      titulo={t('relatoriosComercial.titulo')}
      descricao={t('relatoriosComercial.descricao')}
      breadcrumb={[
        { rotulo: t('relatoriosComercial.painel'), para: '/' },
        { rotulo: t('relatoriosComercial.modulo') },
        { rotulo: t('relatoriosComercial.relatorios') },
      ]}
    />
  );
}
