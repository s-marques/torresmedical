import { useTranslation } from 'react-i18next';
import { ReportPage } from '@/components/shared/report-page/ReportPage';

/**
 * Relatórios de Gestão (`/gestao/relatorios`, docs/inventario/telas/configuracoes-gestao-relatorios.md).
 * Os relatórios GES-01 a GES-04 vêm da API (`RelatoriosGestao`).
 */
export default function RelatoriosGestaoPage() {
  const { t } = useTranslation();
  return (
    <ReportPage
      tela="configuracoes-gestao.relatorios"
      titulo={t('relatoriosGestao.titulo')}
      descricao={t('relatoriosGestao.descricao')}
      breadcrumb={[
        { rotulo: t('relatoriosGestao.painel'), para: '/' },
        { rotulo: t('relatoriosGestao.modulo') },
        { rotulo: t('relatoriosGestao.relatorios') },
      ]}
    />
  );
}
