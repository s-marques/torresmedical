import { useTranslation } from 'react-i18next';
import { ReportPage } from '@/components/shared/report-page/ReportPage';

/**
 * Relatórios - Receita Profissionais (`/receita-profissionais/relatorios`, docs/inventario/telas/gestao-profissionais-relatorios.md).
 * Os relatórios RP-01 a RP-13 vêm da API (`RelatoriosReceitaProfissionais`).
 */
export default function RelatoriosReceitaProfissionaisPage() {
  const { t } = useTranslation();
  return (
    <ReportPage
      tela="gestao-profissionais.relatorios"
      titulo={t('relatoriosReceitaProfissionais.titulo')}
      descricao={t('relatoriosReceitaProfissionais.descricao')}
      breadcrumb={[
        { rotulo: t('relatoriosReceitaProfissionais.painel'), para: '/' },
        { rotulo: t('relatoriosReceitaProfissionais.modulo') },
        { rotulo: t('relatoriosReceitaProfissionais.relatorios') },
      ]}
    />
  );
}
