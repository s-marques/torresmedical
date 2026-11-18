import { ATENDIMENTO_STATUS_ROTULOS, EVOLUCAO_TIPO_ROTULOS } from '@torres/shared';
import { HistoryIcon } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarDataHora } from '@/lib/formatar';
import { useHistorico } from './use-atendimento-medico';

/**
 * Aba "Histórico": atendimentos do paciente, do mais recente para o mais antigo, com as
 * evoluções e a quantidade de receitas de cada um.
 */
export function AbaHistorico({ agendamentoId }: Readonly<{ agendamentoId: string }>) {
  const { data, isPending, isError } = useHistorico(agendamentoId);

  if (isPending) return <Skeleton className="h-24 w-full" aria-label="Carregando" />;
  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar o histórico.
      </p>
    );
  }
  if (data.data.length === 0) {
    return <EmptyState icone={HistoryIcon} titulo="Nenhum atendimento registrado" />;
  }

  return (
    <ul className="grid gap-3" aria-label="Atendimentos do paciente">
      {data.data.map((atendimento) => (
        <li key={atendimento.id}>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                {formatarDataHora(atendimento.iniciadoEm)}
                {atendimento.profissionalNome && ` | Dr(a). ${atendimento.profissionalNome}`}
              </CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {atendimento.totalReceitas}{' '}
                  {atendimento.totalReceitas === 1 ? 'receita' : 'receitas'}
                </span>
                <StatusBadge tom={atendimento.status === 'FINALIZADO' ? 'sucesso' : 'info'}>
                  {ATENDIMENTO_STATUS_ROTULOS[atendimento.status]}
                </StatusBadge>
              </div>
            </CardHeader>
            <CardContent>
              {atendimento.evolucoes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma evolução registrada</p>
              ) : (
                <ul className="grid gap-2" aria-label="Evoluções do atendimento">
                  {atendimento.evolucoes.map((evolucao) => (
                    <li key={evolucao.id} className="grid gap-1">
                      <Badge variant="secondary" className="w-fit">
                        {EVOLUCAO_TIPO_ROTULOS[evolucao.tipo]}
                      </Badge>
                      <p className="text-sm whitespace-pre-wrap">{evolucao.texto}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
