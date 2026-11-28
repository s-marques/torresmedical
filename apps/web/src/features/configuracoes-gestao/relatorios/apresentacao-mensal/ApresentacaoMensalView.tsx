import { useMutation, useQuery } from '@tanstack/react-query';
import { apresentacaoMensalSchema } from '@torres/shared';
import { ArrowLeftIcon, FileDownIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api/client';
import { baixarArquivo } from '@/lib/api/download';
import { mesPadrao, mesValido } from './formatar-apresentacao';
import { IndicadorCard } from './IndicadorCard';

export const URL_APRESENTACAO_MENSAL = '/api/configuracoes-gestao/apresentacao-mensal';
/** Parâmetro da tela Relatórios de Gestão que abre esta visão. */
export const PARAMETRO_VISAO = 'visao';
export const VISAO_APRESENTACAO = 'apresentacao';

/**
 * Apresentação mensal da gestão (issue #171, R §27): os 10 indicadores do prédio no mês escolhido
 * (padrão: o mês anterior) e o PDF em formato de apresentação, uma página por indicador. Mora na
 * tela Relatórios de Gestão (`?visao=apresentacao`).
 */
export function ApresentacaoMensalView() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [padrao] = useState(() => mesPadrao());
  const pedido = params.get('mes');
  const mes = mesValido(pedido) ? pedido : padrao;

  const consulta = useQuery({
    queryKey: ['apresentacao-mensal', mes],
    queryFn: ({ signal }) =>
      apiFetch(URL_APRESENTACAO_MENSAL, {
        schema: apresentacaoMensalSchema,
        query: { mes },
        signal,
      }),
  });
  const exportacao = useMutation({
    mutationFn: () =>
      baixarArquivo(`${URL_APRESENTACAO_MENSAL}/pdf`, { mes }, `apresentacao-mensal-${mes}.pdf`),
  });

  const escolherMes = (novo: string) => {
    if (!mesValido(novo)) return;
    setParams(
      (atuais) => {
        const proximo = new URLSearchParams(atuais);
        proximo.set('mes', novo);
        return proximo;
      },
      { replace: true },
    );
  };

  const indicadores = consulta.data?.indicadores;
  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={t('apresentacao.titulo')}
        descricao={t('apresentacao.descricao')}
        breadcrumb={[
          { rotulo: t('relatoriosGestao.painel'), para: '/' },
          { rotulo: t('relatoriosGestao.modulo') },
          { rotulo: t('relatoriosGestao.relatorios'), para: '/gestao/relatorios' },
          { rotulo: t('apresentacao.titulo') },
        ]}
        acoes={
          <>
            <Button asChild variant="outline">
              <Link to="/gestao/relatorios">
                <ArrowLeftIcon aria-hidden />
                {t('apresentacao.voltar')}
              </Link>
            </Button>
            <SePermitido permissao="configuracoes-gestao.relatorios.exportar">
              <Button
                onClick={() => exportacao.mutate()}
                disabled={exportacao.isPending || consulta.isPending || !indicadores?.length}
              >
                <FileDownIcon aria-hidden />
                {exportacao.isPending
                  ? t('apresentacao.gerandoPdf')
                  : t('apresentacao.exportarPdf')}
              </Button>
            </SePermitido>
          </>
        }
      />
      <section
        aria-label={t('apresentacao.selecao')}
        className="grid max-w-xs gap-2 rounded-xl border bg-card p-4 shadow-xs"
      >
        <Label htmlFor="apresentacao-mes">{t('apresentacao.mes')}</Label>
        <Input
          id="apresentacao-mes"
          type="month"
          value={mes}
          onChange={(evento) => escolherMes(evento.target.value)}
        />
      </section>
      {consulta.isPending && (
        <Skeleton className="h-40 w-full" aria-label={t('apresentacao.carregando')} />
      )}
      {indicadores?.length === 0 && (
        <EmptyState titulo={t('apresentacao.vazio')} descricao={t('apresentacao.vazioDescricao')} />
      )}
      {indicadores && indicadores.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-2">
          {indicadores.map((indicador) => (
            <IndicadorCard key={indicador.id} indicador={indicador} mes={mes} />
          ))}
        </div>
      )}
    </div>
  );
}
