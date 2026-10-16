import { ReportPage } from '@/components/shared/report-page/ReportPage';

/**
 * Relatórios de Gestão (`/gestao/relatorios`, docs/inventario/telas/configuracoes-gestao-relatorios.md).
 * Por enquanto com o relatório de exemplo da infraestrutura (#82); os GES-01..04 vêm na #34.
 */
export default function RelatoriosGestaoPage() {
  return (
    <ReportPage
      tela="configuracoes-gestao.relatorios"
      titulo="Relatórios de Gestão"
      descricao="Log de acesso, ticket médio, ocupação de sala e LTV."
      breadcrumb={[{ rotulo: 'Painel', para: '/' }, { rotulo: 'Gestão' }, { rotulo: 'Relatórios' }]}
    />
  );
}
