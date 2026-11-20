import type { IndicadorFinanceiro } from '@torres/shared';
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  BanknoteIcon,
  BuildingIcon,
  DoorOpenIcon,
  HandshakeIcon,
  RepeatIcon,
  ShoppingBagIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  UserMinusIcon,
  UserPlusIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatarIndicador, formatarPercentual } from './formatar-indicador';

const ICONES: Record<string, LucideIcon> = {
  'faturamento-total': BanknoteIcon,
  'receita-recorrente': RepeatIcon,
  'receita-avulsa': ShoppingBagIcon,
  'resultado-operacional': TrendingUpIcon,
  'taxa-ocupacao': BuildingIcon,
  vacancia: DoorOpenIcon,
  permutas: HandshakeIcon,
  'novos-clientes': UserPlusIcon,
  'contratos-cancelados': UserMinusIcon,
  'despesas-pagas': TrendingDownIcon,
};

/** Indicadores em que cair é bom (despesa, cancelamento, vacância): a cor da variação se inverte. */
const MENOR_E_MELHOR = new Set(['despesas-pagas', 'contratos-cancelados', 'vacancia']);

function Variacao({ indicador }: Readonly<{ indicador: IndicadorFinanceiro }>) {
  const { t } = useTranslation();
  const { variacao } = indicador;
  if (variacao === null) return null;
  const subiu = variacao >= 0;
  const bom = MENOR_E_MELHOR.has(indicador.id) ? !subiu : subiu;
  const Seta = subiu ? ArrowUpRightIcon : ArrowDownRightIcon;
  const texto = formatarPercentual(Math.abs(variacao));
  return (
    <span
      title={t('indicadoresFinanceiros.variacao', { valor: texto })}
      data-testid={`variacao-${indicador.id}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        bom
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
          : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
      )}
    >
      <Seta className="size-3" aria-hidden />
      {texto}
    </span>
  );
}

/** Card de um indicador: ícone, valor, rótulo e comparação com o mês anterior. */
export function CardIndicador({ indicador }: Readonly<{ indicador: IndicadorFinanceiro }>) {
  const { t } = useTranslation();
  const Icone = ICONES[indicador.id] ?? BanknoteIcon;
  return (
    <Card className="py-4">
      <CardContent className="space-y-3 px-4">
        <div className="flex items-start justify-between">
          <span className="rounded-lg bg-muted p-2 text-muted-foreground">
            <Icone className="size-5" aria-hidden />
          </span>
          <Variacao indicador={indicador} />
        </div>
        <p className="text-2xl font-bold" data-testid={`valor-${indicador.id}`}>
          {formatarIndicador(indicador.valor, indicador.formato)}
        </p>
        <div className="space-y-0.5 text-sm text-muted-foreground">
          <p>{t(`indicadoresFinanceiros.cards.${indicador.id}`)}</p>
          {indicador.anterior !== null && (
            <p className="text-xs" data-testid={`anterior-${indicador.id}`}>
              {t('indicadoresFinanceiros.anterior', {
                valor: formatarIndicador(indicador.anterior, indicador.formato),
              })}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
