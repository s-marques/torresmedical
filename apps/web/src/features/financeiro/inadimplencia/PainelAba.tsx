import {
  FAIXAS_AGING,
  listTitulosInadimplentesQuerySchema,
  tituloInadimplentePageSchema,
  type PainelInadimplencia,
  type TituloInadimplente,
} from '@torres/shared';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, FiltroGrid } from '@/components/shared/data-grid/tipos';
import { Card, CardContent } from '@/components/ui/card';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { cn } from '@/lib/utils';
import { URL_TITULOS_INADIMPLENTES } from './use-inadimplencia';

const reais = (valor: string) => formatarMoeda(Number(valor));

function Indicador({
  rotulo,
  valor,
  detalhe,
  destaque = false,
  id,
}: Readonly<{ rotulo: string; valor: string; detalhe?: string; destaque?: boolean; id: string }>) {
  return (
    <Card data-testid={`indicador-${id}`}>
      <CardContent className="grid gap-1 p-4">
        <span className="text-sm text-muted-foreground">{rotulo}</span>
        <span
          className={cn('text-2xl font-semibold', destaque && 'text-red-700 dark:text-red-400')}
        >
          {valor}
        </span>
        {detalhe && <span className="text-xs text-muted-foreground">{detalhe}</span>}
      </CardContent>
    </Card>
  );
}

function colunas(t: TFunction): ColunaGrid<TituloInadimplente>[] {
  return [
    { id: 'numero', titulo: '#', ocultavel: false },
    { id: 'descricao', titulo: t('inadimplencia.titulos.colunas.descricao'), tituloCartao: true },
    {
      id: 'sacado',
      titulo: t('inadimplencia.titulos.colunas.sacado'),
      celula: (titulo) => titulo.sacadoNome ?? '-',
    },
    {
      id: 'contrato',
      titulo: t('inadimplencia.titulos.colunas.contrato'),
      celula: (titulo) => (titulo.contratoSalaNumero ? `#${titulo.contratoSalaNumero}` : '-'),
    },
    {
      id: 'dataVencimento',
      titulo: t('inadimplencia.titulos.colunas.vencimento'),
      ordenavel: 'vencimento',
      celula: (titulo) => formatarData(titulo.dataVencimento),
    },
    {
      id: 'diasEmAtraso',
      titulo: t('inadimplencia.titulos.colunas.atraso'),
      ordenavel: 'atraso',
      celula: (titulo) => t('inadimplencia.titulos.dias', { count: titulo.diasEmAtraso }),
    },
    {
      id: 'saldo',
      titulo: t('inadimplencia.titulos.colunas.saldo'),
      ordenavel: true,
      celula: (titulo) => reais(titulo.saldo),
    },
    {
      id: 'cobrancas',
      titulo: t('inadimplencia.titulos.colunas.cobrancas'),
      celula: (titulo) => titulo.cobrancas,
    },
  ];
}

/** Aba Painel: indicadores do dia, aging, profissionais inadimplentes e os títulos vencidos. */
export function PainelAba({ painel }: Readonly<{ painel: PainelInadimplencia }>) {
  const { t } = useTranslation();
  const COLUNAS = useMemo(() => colunas(t), [t]);
  const FILTROS: readonly FiltroGrid[] = useMemo(
    () => [
      {
        tipo: 'select',
        parametro: 'faixa',
        rotulo: t('inadimplencia.aging.titulo'),
        rotuloTodos: t('inadimplencia.aging.todas'),
        opcoes: FAIXAS_AGING.map((valor) => ({ valor, rotulo: t(`inadimplencia.aging.${valor}`) })),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-6">
      <section
        aria-label={t('inadimplencia.indicadores.titulo')}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Indicador
          id="a-receber-hoje"
          rotulo={t('inadimplencia.indicadores.aReceberHoje')}
          valor={reais(painel.aReceberHoje.valor)}
          detalhe={t('inadimplencia.indicadores.titulos', {
            count: painel.aReceberHoje.quantidade,
          })}
        />
        <Indicador
          id="vencidos"
          destaque={painel.vencidos.quantidade > 0}
          rotulo={t('inadimplencia.indicadores.vencidos')}
          valor={reais(painel.vencidos.valor)}
          detalhe={t('inadimplencia.indicadores.titulos', { count: painel.vencidos.quantidade })}
        />
        <Indicador
          id="contratos"
          rotulo={t('inadimplencia.indicadores.contratos')}
          valor={String(painel.contratosInadimplentes)}
        />
        <Indicador
          id="profissionais"
          rotulo={t('inadimplencia.indicadores.profissionais')}
          valor={String(painel.profissionaisInadimplentes)}
        />
      </section>

      <section aria-label={t('inadimplencia.aging.titulo')} className="grid gap-3">
        <h2 className="text-base font-semibold">{t('inadimplencia.aging.titulo')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {painel.aging.map((faixa) => (
            <Indicador
              key={faixa.faixa}
              id={`aging-${faixa.faixa}`}
              rotulo={t(`inadimplencia.aging.${faixa.faixa}`)}
              valor={reais(faixa.valor)}
              detalhe={t('inadimplencia.indicadores.titulos', { count: faixa.quantidade })}
            />
          ))}
        </div>
      </section>

      <section aria-label={t('inadimplencia.porProfissional.titulo')} className="grid gap-3">
        <h2 className="text-base font-semibold">{t('inadimplencia.porProfissional.titulo')}</h2>
        {painel.porProfissional.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('inadimplencia.porProfissional.vazio')}
          </p>
        ) : (
          <ul className="grid gap-2">
            {painel.porProfissional.map((profissional) => (
              <li
                key={profissional.profissionalId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2 text-sm"
              >
                <span className="font-medium">{profissional.nome}</span>
                <span className="text-muted-foreground">
                  {t('inadimplencia.porProfissional.resumo', {
                    valor: reais(profissional.valor),
                    titulos: profissional.quantidade,
                    dias: profissional.maiorAtrasoDias,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t('inadimplencia.titulos.titulo')} className="grid gap-3">
        <h2 className="text-base font-semibold">{t('inadimplencia.titulos.titulo')}</h2>
        <DataGrid
          url={URL_TITULOS_INADIMPLENTES}
          schema={tituloInadimplentePageSchema}
          querySchema={listTitulosInadimplentesQuerySchema}
          colunas={COLUNAS}
          filtros={FILTROS}
          mensagemVazio={t('inadimplencia.titulos.vazio')}
        />
      </section>
    </div>
  );
}
