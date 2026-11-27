import type { FormatoIndicadorApresentacao, PontoIndicador } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { formatarValorIndicador, mesCurto } from './formatar-apresentacao';
import { useRotuloDoPonto } from './use-rotulo-do-ponto';

const LARGURA = 600;
const ALTURA = 200;
const TOPO = 18;
const BASE = 28;
const MAX_LARGURA_BARRA = 64;

interface GraficoProps {
  formato: FormatoIndicadorApresentacao;
  serie: readonly PontoIndicador[];
  /** Descrição do gráfico para leitores de tela. */
  descricao: string;
}

/** Barras por mês (o último, o mês escolhido, em destaque), a partir da linha do zero. */
export function GraficoTendencia({ formato, serie, descricao }: Readonly<GraficoProps>) {
  const { t } = useTranslation();
  const valores = serie.flatMap((p) => (p.valor === null ? [] : [p.valor]));
  const maximo = Math.max(0, ...valores);
  const minimo = Math.min(0, ...valores);
  const amplitude = maximo - minimo || 1;
  const area = ALTURA - TOPO - BASE - 14;
  const zero = TOPO + 14 + (maximo / amplitude) * area;
  const passo = LARGURA / Math.max(serie.length, 1);
  const barra = Math.min(passo * 0.6, MAX_LARGURA_BARRA);

  return (
    <svg
      role="img"
      aria-label={descricao}
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      className="h-auto w-full max-w-3xl"
    >
      <line x1={0} x2={LARGURA} y1={zero} y2={zero} className="stroke-border" />
      {serie.map((ponto, i) => {
        const centro = i * passo + passo / 2;
        const ultimo = i === serie.length - 1;
        if (ponto.valor === null) {
          return (
            <g key={ponto.rotulo}>
              <text
                x={centro}
                y={zero - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] italic"
              >
                {t('apresentacao.indisponivel')}
              </text>
              <text
                x={centro}
                y={ALTURA - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {mesCurto(ponto.rotulo)}
              </text>
            </g>
          );
        }
        const altura = Math.max((Math.abs(ponto.valor) / amplitude) * area, 1);
        const y = ponto.valor >= 0 ? zero - altura : zero;
        return (
          <g key={ponto.rotulo}>
            <rect
              x={centro - barra / 2}
              y={y}
              width={barra}
              height={altura}
              className={ultimo ? 'fill-primary' : 'fill-muted-foreground/40'}
            />
            <text
              x={centro}
              y={ponto.valor >= 0 ? y - 4 : y + altura + 11}
              textAnchor="middle"
              className="fill-foreground text-[10px]"
            >
              {formatarValorIndicador(formato, ponto.valor)}
            </text>
            <text
              x={centro}
              y={ALTURA - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {mesCurto(ponto.rotulo)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface ComparativoProps extends GraficoProps {
  /** Legenda das barras claras (mês anterior ou média). */
  rotuloComparacao: string | null;
  rotuloAtual: string;
}

/** Uma linha por item: barra do mês e, abaixo, a de comparação. Sem valor: "dado indisponível". */
export function GraficoComparativo({
  formato,
  serie,
  descricao,
  rotuloComparacao,
  rotuloAtual,
}: Readonly<ComparativoProps>) {
  const { t } = useTranslation();
  const rotulo = useRotuloDoPonto();
  const maximo = Math.max(
    1,
    ...serie.flatMap((p) => [p.valor ?? 0, p.anterior ?? 0].map((v) => Math.abs(v))),
  );
  const largura = (valor: number) => `${Math.max((Math.abs(valor) / maximo) * 100, 1)}%`;

  return (
    <div role="group" aria-label={descricao} className="grid gap-2">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-sm bg-primary" />
          {rotuloAtual}
        </span>
        {rotuloComparacao && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-sm bg-muted-foreground/40" />
            {rotuloComparacao}
          </span>
        )}
      </div>
      <ul className="grid gap-3">
        {serie.map((ponto) => (
          <li
            key={`${ponto.chave ?? ''}${ponto.rotulo}`}
            className="grid items-center gap-1 sm:grid-cols-[minmax(0,14rem)_1fr]"
          >
            <span className="truncate text-sm">{rotulo(ponto)}</span>
            {ponto.valor === null ? (
              <span className="text-sm italic text-muted-foreground">
                {t('apresentacao.indisponivel')}
              </span>
            ) : (
              <div className="grid gap-1">
                <Barra
                  largura={largura(ponto.valor)}
                  cor="bg-primary"
                  texto={formatarValorIndicador(formato, ponto.valor)}
                />
                {ponto.anterior !== null && (
                  <Barra
                    largura={largura(ponto.anterior)}
                    cor="bg-muted-foreground/40"
                    texto={formatarValorIndicador(formato, ponto.anterior)}
                    suave
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Barra({
  largura,
  cor,
  texto,
  suave = false,
}: Readonly<{ largura: string; cor: string; texto: string; suave?: boolean }>) {
  return (
    <div className="flex items-center gap-2">
      <div
        aria-hidden
        className={`${suave ? 'h-1.5' : 'h-2.5'} rounded-sm ${cor}`}
        style={{ width: largura, maxWidth: 'calc(100% - 6.5rem)' }}
      />
      <span className={`whitespace-nowrap text-xs ${suave ? 'text-muted-foreground' : ''}`}>
        {texto}
      </span>
    </div>
  );
}
