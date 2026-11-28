import { PresentationIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { ReportPage } from '@/components/shared/report-page/ReportPage';
import { Button } from '@/components/ui/button';
import {
  ApresentacaoMensalView,
  PARAMETRO_VISAO,
  VISAO_APRESENTACAO,
} from './apresentacao-mensal/ApresentacaoMensalView';

/**
 * Relatórios de Gestão (`/gestao/relatorios`, docs/inventario/telas/configuracoes-gestao-relatorios.md).
 * Os relatórios GES-01 a GES-06 vêm da API (`RelatoriosGestao`). A apresentação mensal da gestão
 * (issue #171) é a outra visão da tela, em `?visao=apresentacao`.
 */
export default function RelatoriosGestaoPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  if (params.get(PARAMETRO_VISAO) === VISAO_APRESENTACAO) return <ApresentacaoMensalView />;
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
      acoes={
        <Button asChild variant="outline">
          <Link to={`?${PARAMETRO_VISAO}=${VISAO_APRESENTACAO}`}>
            <PresentationIcon aria-hidden />
            {t('apresentacao.abrir')}
          </Link>
        </Button>
      }
    />
  );
}
