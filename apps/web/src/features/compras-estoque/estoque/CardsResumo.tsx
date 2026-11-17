import type { ResumoEstoque } from '@torres/shared';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatarValor } from './formatar';
import { useResumoEstoque } from './use-estoque';

interface CardInfo {
  rotulo: string;
  valor: (r: ResumoEstoque) => string;
  /** Destaque vermelho quando o valor é maior que zero (print: "Zerados"). */
  alerta?: (r: ResumoEstoque) => boolean;
  dica?: string;
}

const inteiro = (n: number) => String(n);

const CARDS: readonly CardInfo[] = [
  { rotulo: 'Total Produtos', valor: (r) => inteiro(r.totalProdutos) },
  { rotulo: 'Controlados', valor: (r) => inteiro(r.controlados) },
  {
    rotulo: 'Abaixo do Mínimo',
    valor: (r) => inteiro(r.abaixoMinimo),
    alerta: (r) => r.abaixoMinimo > 0,
  },
  { rotulo: 'Zerados', valor: (r) => inteiro(r.zerados), alerta: (r) => r.zerados > 0 },
  { rotulo: 'Valor em Estoque', valor: (r) => formatarValor(r.valorEstoque) },
  {
    rotulo: 'Vencendo 30d',
    valor: (r) => inteiro(r.vencendo30d),
    dica: 'Lotes que vencem em até 30 dias.',
  },
  { rotulo: 'Vencidos', valor: (r) => inteiro(r.vencidos), dica: 'Lotes com a validade vencida.' },
  { rotulo: 'Mov. 24h', valor: (r) => inteiro(r.movimentacoes24h) },
];

/** Os 8 cards do topo da tela (print principal). */
export function CardsResumo() {
  const resumo = useResumoEstoque();
  return (
    <section aria-label="Resumo do estoque" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map((card) => {
        const destaque = resumo.data && card.alerta?.(resumo.data);
        return (
          <Card key={card.rotulo} className={cn('py-4', destaque && 'border-destructive/50')}>
            <CardContent className="grid gap-1 px-4">
              <p className="text-xs text-muted-foreground">{card.rotulo}</p>
              <p
                className={cn(
                  'text-2xl font-semibold tabular-nums',
                  destaque && 'text-destructive',
                )}
                title={card.dica}
              >
                {resumo.data ? card.valor(resumo.data) : '…'}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
