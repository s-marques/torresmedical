import type { HistoricoClinicoItem } from '@torres/shared';
import { EyeIcon } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarDataHora } from '@/lib/formatar';
import { useHistoricoClinico } from './use-prontuarios';

export interface AbaHistoricoClinicoProps {
  pacienteId: string;
}

/** Aba "Histórico Clínico": linha do tempo somente leitura (atendimentos e anamneses). */
export function AbaHistoricoClinico({ pacienteId }: Readonly<AbaHistoricoClinicoProps>) {
  const { data, isPending } = useHistoricoClinico(pacienteId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico Clínico</CardTitle>
        <p className="text-sm text-muted-foreground">
          Registros clínicos do paciente{data ? ` (${data.meta.total} registros)` : ''}
        </p>
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className="h-32 w-full" aria-label="Carregando" />}
        {data && data.data.length === 0 && (
          <EmptyState icone={EyeIcon} titulo="Nenhum registro clínico encontrado." />
        )}
        {data && data.data.length > 0 && (
          <ul className="grid gap-2">
            {data.data.map((item) => (
              <LinhaHistorico key={item.id} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LinhaHistorico({ item }: Readonly<{ item: HistoricoClinicoItem }>) {
  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={item.tipo === 'ATENDIMENTO' ? 'default' : 'secondary'}>{item.rotulo}</Badge>
        <span className="text-sm text-muted-foreground">{formatarDataHora(item.data)}</span>
      </div>
      {item.resumo && <p className="mt-1 text-sm">{item.resumo}</p>}
      {item.profissionalNome && (
        <p className="mt-1 text-xs text-muted-foreground">{item.profissionalNome}</p>
      )}
    </li>
  );
}
