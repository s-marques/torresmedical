import type {
  AlertaPainel,
  BlocoPainel,
  KpiPainel,
  MetaVsAtualPainel,
  SecaoPainel,
} from '@torres/shared';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatarValor } from './formatar-painel';
import { TabelaPainelCard } from './TabelaPainelCard';

function KpiCard({ kpi }: Readonly<{ kpi: KpiPainel }>) {
  const { t } = useTranslation();
  const cartao = (
    <Card className={cn('gap-1 py-4', kpi.link && 'transition-colors hover:bg-accent')}>
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium">{kpi.rotulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-4">
        <p className="text-2xl font-bold" data-testid={`kpi-${kpi.id}`}>
          {formatarValor(kpi.valor, kpi.formato)}
        </p>
        {kpi.detalhe && <p className="text-xs text-muted-foreground">{kpi.detalhe}</p>}
      </CardContent>
    </Card>
  );
  if (!kpi.link) return cartao;
  // O link já traz o período e o filtro do indicador (calculados na API): a lista abre igual ao número.
  return (
    <Link
      to={kpi.link}
      aria-label={t('painel.hoje.verLista', { indicador: kpi.rotulo })}
      className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {cartao}
    </Link>
  );
}

function Alerta({ alerta }: Readonly<{ alerta: AlertaPainel }>) {
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <TriangleAlertIcon aria-hidden />
      <AlertTitle>
        {alerta.titulo} ({alerta.itens.length})
      </AlertTitle>
      <AlertDescription>
        <p>{alerta.descricao}</p>
        <ul className="mt-2 w-full divide-y text-sm">
          {alerta.itens.map((item) => (
            <li key={`${item.rotulo}-${item.valor}`} className="flex justify-between py-1">
              <span>{item.rotulo}</span>
              <span className="text-muted-foreground">{item.valor}</span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function MetaVsAtual({ bloco }: Readonly<{ bloco: MetaVsAtualPainel }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{bloco.titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Indicador</TableHead>
              <TableHead className="text-center">Meta</TableHead>
              <TableHead className="text-right">Atual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bloco.indicadores.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.rotulo}</TableCell>
                <TableCell className="text-center text-muted-foreground">{i.meta ?? '—'}</TableCell>
                <TableCell
                  className={cn(
                    'text-right font-semibold',
                    i.destacarNegativo && (i.atual ?? 0) < 0 && 'text-destructive',
                  )}
                >
                  {formatarValor(i.atual, i.formato)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

type Grupo = { kpis: true; itens: KpiPainel[] } | { kpis: false; itens: BlocoPainel[] };

/** Agrupa blocos vizinhos na ordem: os KPIs viram uma grade de cartões; o resto, uma grade de 2 colunas. */
function agrupar(blocos: BlocoPainel[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const bloco of blocos) {
    const ultimo = grupos.at(-1);
    if (bloco.tipo === 'kpi') {
      if (ultimo?.kpis) ultimo.itens.push(bloco);
      else grupos.push({ kpis: true, itens: [bloco] });
    } else if (ultimo && !ultimo.kpis) ultimo.itens.push(bloco);
    else grupos.push({ kpis: false, itens: [bloco] });
  }
  return grupos;
}

function Bloco({ bloco }: Readonly<{ bloco: Exclude<BlocoPainel, KpiPainel> }>) {
  switch (bloco.tipo) {
    case 'alerta':
      return <Alerta alerta={bloco} />;
    case 'meta-vs-atual':
      return <MetaVsAtual bloco={bloco} />;
    default:
      return <TabelaPainelCard bloco={bloco} />;
  }
}

export function SecaoPainelView({ secao }: Readonly<{ secao: SecaoPainel }>) {
  const grupos = agrupar(secao.blocos);
  if (grupos.length === 0) return null;
  return (
    <section aria-label={secao.titulo ?? undefined} className="space-y-4">
      {secao.titulo && (
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground">
          {secao.titulo}
        </h2>
      )}
      {grupos.map((grupo, i) =>
        grupo.kpis ? (
          <div
            key={`kpis-${i}`}
            className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]"
          >
            {grupo.itens.map((kpi) => (
              <KpiCard key={kpi.id} kpi={kpi} />
            ))}
          </div>
        ) : (
          <div key={`blocos-${i}`} className="grid gap-4 lg:grid-cols-2">
            {grupo.itens.map((bloco) => (
              <div
                key={bloco.id}
                className={cn(
                  !(bloco.tipo === 'tabela' && bloco.largura === 'meia') && 'lg:col-span-2',
                )}
              >
                <Bloco bloco={bloco as Exclude<BlocoPainel, KpiPainel>} />
              </div>
            ))}
          </div>
        ),
      )}
    </section>
  );
}
