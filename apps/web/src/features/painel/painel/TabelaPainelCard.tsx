import type { TabelaPainel, VisualizacaoPainel } from '@torres/shared';
import { BarChart3Icon, LineChartIcon, PieChartIcon, TableIcon } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatarValor, formatoNumerico } from './formatar-painel';
import { GraficoBarras, GraficoLinha, GraficoPizza } from './GraficoPainel';

const ICONES: Record<VisualizacaoPainel, typeof TableIcon> = {
  tabela: TableIcon,
  barras: BarChart3Icon,
  pizza: PieChartIcon,
  linha: LineChartIcon,
};

const ROTULOS: Record<VisualizacaoPainel, string> = {
  tabela: 'Tabela',
  barras: 'Barras',
  pizza: 'Pizza',
  linha: 'Linha',
};

/** Bloco de tabela do dashboard, com a alternância Tabela/Barras/Pizza/Linha do cabeçalho. */
export function TabelaPainelCard({ bloco }: Readonly<{ bloco: TabelaPainel }>) {
  const [visualizacao, setVisualizacao] = useState<VisualizacaoPainel>(bloco.padrao);
  const [metricaEscolhida, setMetricaEscolhida] = useState<string | null>(null);

  const [categoria, ...demais] = bloco.colunas;
  const metricas = demais.filter((c) => formatoNumerico(c.formato));
  const metrica = metricas.find((m) => m.chave === metricaEscolhida) ?? metricas[0];
  const pontos =
    categoria && metrica
      ? bloco.linhas.map((linha) => ({
          categoria: String(linha[categoria.chave] ?? '—'),
          valor: Number(linha[metrica.chave] ?? 0),
        }))
      : [];
  const grafico = visualizacao !== 'tabela';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{bloco.titulo}</CardTitle>
        <div className="flex items-center gap-1">
          {grafico && metricas.length > 1 && (
            <Select value={metrica?.chave} onValueChange={setMetricaEscolhida}>
              <SelectTrigger size="sm" aria-label={`Métrica de ${bloco.titulo}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {metricas.map((m) => (
                  <SelectItem key={m.chave} value={m.chave}>
                    {m.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {bloco.visualizacoes.length > 1 &&
            bloco.visualizacoes.map((v) => {
              const Icone = ICONES[v];
              return (
                <Button
                  key={v}
                  type="button"
                  size="icon"
                  variant={v === visualizacao ? 'secondary' : 'ghost'}
                  aria-label={`${ROTULOS[v]}: ${bloco.titulo}`}
                  aria-pressed={v === visualizacao}
                  onClick={() => setVisualizacao(v)}
                >
                  <Icone aria-hidden className="size-4" />
                </Button>
              );
            })}
        </div>
      </CardHeader>
      <CardContent>
        {bloco.linhas.length === 0 ? (
          <EmptyState titulo="Sem dados no período" className="py-6" />
        ) : (
          <Conteudo bloco={bloco} visualizacao={visualizacao} pontos={pontos} metrica={metrica} />
        )}
      </CardContent>
    </Card>
  );
}

interface ConteudoProps {
  bloco: TabelaPainel;
  visualizacao: VisualizacaoPainel;
  pontos: { categoria: string; valor: number }[];
  metrica: TabelaPainel['colunas'][number] | undefined;
}

function Conteudo({ bloco, visualizacao, pontos, metrica }: Readonly<ConteudoProps>) {
  if (visualizacao !== 'tabela' && metrica) {
    const props = { pontos, formato: metrica.formato, titulo: bloco.titulo };
    if (visualizacao === 'barras') return <GraficoBarras {...props} />;
    if (visualizacao === 'pizza') return <GraficoPizza {...props} />;
    return <GraficoLinha {...props} />;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {bloco.colunas.map((c, i) => (
            <TableHead
              key={c.chave}
              className={cn(i > 0 && formatoNumerico(c.formato) && 'text-right')}
            >
              {c.rotulo}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {bloco.linhas.map((linha, i) => (
          <TableRow key={`${bloco.id}-${i}`}>
            {bloco.colunas.map((c, j) => (
              <TableCell
                key={c.chave}
                className={cn(j > 0 && formatoNumerico(c.formato) && 'text-right')}
              >
                {formatarValor(linha[c.chave], c.formato)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
