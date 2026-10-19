import { formatarValor } from './formatar-painel';
import type { FormatoPainel } from '@torres/shared';

export interface PontoGrafico {
  categoria: string;
  valor: number;
}

interface GraficoProps {
  pontos: PontoGrafico[];
  formato: FormatoPainel;
  titulo: string;
}

/** Paleta fixa e distinguível; o 9º ponto em diante reaproveita as cores. */
const CORES = [
  '#0ea5e9',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#14b8a6',
  '#84cc16',
];

const LARGURA = 600;

/** Barras horizontais: o rótulo da categoria à esquerda, o valor ao fim da barra. */
export function GraficoBarras({ pontos, formato, titulo }: Readonly<GraficoProps>) {
  const maximo = Math.max(...pontos.map((p) => Math.abs(p.valor)), 1);
  const linha = 26;
  const rotulo = 150;
  const util = LARGURA - rotulo - 90;
  return (
    <svg
      role="img"
      aria-label={`${titulo}: barras`}
      viewBox={`0 0 ${LARGURA} ${pontos.length * linha + 8}`}
      className="w-full"
    >
      {pontos.map((p, i) => {
        const largura = (Math.abs(p.valor) / maximo) * util;
        return (
          <g key={p.categoria} transform={`translate(0 ${i * linha + 4})`}>
            <text
              x={rotulo - 8}
              y={14}
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              {p.categoria.length > 22 ? `${p.categoria.slice(0, 21)}…` : p.categoria}
            </text>
            <rect
              x={rotulo}
              y={2}
              height={16}
              width={Math.max(largura, 1)}
              rx={2}
              fill={CORES[0]}
            />
            <text x={rotulo + largura + 6} y={14} className="fill-foreground text-[11px]">
              {formatarValor(p.valor, formato)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Pizza em anel com legenda (categoria e valor). */
export function GraficoPizza({ pontos, formato, titulo }: Readonly<GraficoProps>) {
  const positivos = pontos.filter((p) => p.valor > 0);
  const total = positivos.reduce((soma, p) => soma + p.valor, 0);
  const raio = 70;
  const grossura = 28;
  let acumulado = 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <svg role="img" aria-label={`${titulo}: pizza`} viewBox="-90 -90 180 180" className="size-44">
        {total === 0 ? (
          <circle r={raio} fill="none" strokeWidth={grossura} className="stroke-muted" />
        ) : (
          positivos.map((p, i) => {
            const fracao = p.valor / total;
            const circunferencia = 2 * Math.PI * raio;
            const fatia = (
              <circle
                key={p.categoria}
                r={raio}
                fill="none"
                stroke={CORES[i % CORES.length]}
                strokeWidth={grossura}
                strokeDasharray={`${fracao * circunferencia} ${circunferencia}`}
                strokeDashoffset={-acumulado * circunferencia}
                transform="rotate(-90)"
              />
            );
            acumulado += fracao;
            return fatia;
          })
        )}
      </svg>
      <ul className="space-y-1 text-xs">
        {positivos.map((p, i) => (
          <li key={p.categoria} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: CORES[i % CORES.length] }}
            />
            <span>{p.categoria}</span>
            <span className="ml-auto pl-4 text-muted-foreground">
              {formatarValor(p.valor, formato)} ({Math.round((p.valor / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Linha ligando os valores na ordem das categorias. */
export function GraficoLinha({ pontos, formato, titulo }: Readonly<GraficoProps>) {
  const maximo = Math.max(...pontos.map((p) => p.valor), 1);
  const alto = 160;
  const margem = 24;
  const passo = pontos.length > 1 ? (LARGURA - 2 * margem) / (pontos.length - 1) : 0;
  const coordenadas = pontos.map((p, i) => ({
    ...p,
    x: margem + i * passo,
    y: alto - margem - (Math.max(p.valor, 0) / maximo) * (alto - 2 * margem),
  }));
  return (
    <svg
      role="img"
      aria-label={`${titulo}: linha`}
      viewBox={`0 0 ${LARGURA} ${alto + 20}`}
      className="w-full"
    >
      <line
        x1={margem}
        x2={LARGURA - margem}
        y1={alto - margem}
        y2={alto - margem}
        className="stroke-border"
      />
      <polyline
        fill="none"
        stroke={CORES[0]}
        strokeWidth={2}
        points={coordenadas.map((c) => `${c.x},${c.y}`).join(' ')}
      />
      {coordenadas.map((c) => (
        <g key={c.categoria}>
          <circle cx={c.x} cy={c.y} r={3.5} fill={CORES[0]}>
            <title>{`${c.categoria}: ${formatarValor(c.valor, formato)}`}</title>
          </circle>
          <text
            x={c.x}
            y={alto + 8}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {c.categoria.length > 10 ? `${c.categoria.slice(0, 9)}…` : c.categoria}
          </text>
        </g>
      ))}
    </svg>
  );
}
