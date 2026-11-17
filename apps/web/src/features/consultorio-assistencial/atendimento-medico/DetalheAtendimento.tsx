import { podeAtender } from '@torres/shared';
import {
  ChevronLeftIcon,
  FileTextIcon,
  PlayIcon,
  UserIcon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissao } from '@/lib/auth/use-sessao';
import { cn } from '@/lib/utils';
import { horaLocal } from '@/features/comercial-atendimento/agenda/agenda-datas';
import { AbaDados } from './AbaDados';
import { AbaEvolucao } from './AbaEvolucao';
import { StatusAgendamento } from './StatusAgendamento';
import { useDetalheAtendimento, useIniciarAtendimento } from './use-atendimento-medico';

type IdAba = 'evolucao' | 'dados';

/**
 * Abas desta entrega. Receita, Orçamento, Histórico e Pagamento ficam para a segunda parte da
 * issue #38, junto com o "Finalizar".
 */
const ABAS: readonly { id: IdAba; rotulo: string; icone: LucideIcon }[] = [
  { id: 'evolucao', rotulo: 'Evolução', icone: FileTextIcon },
  { id: 'dados', rotulo: 'Dados', icone: UserIcon },
];

export interface DetalheAtendimentoProps {
  agendamentoId: string;
  onVoltar: () => void;
}

/** Detalhe aberto pelo clique na linha ou pelo "Atender". */
export function DetalheAtendimento({ agendamentoId, onVoltar }: Readonly<DetalheAtendimentoProps>) {
  const { data, isPending, isError } = useDetalheAtendimento(agendamentoId);
  const iniciar = useIniciarAtendimento();
  const podeIniciar = usePermissao('consultorio-assistencial.atendimento-medico.criar');
  const [aba, setAba] = useState<IdAba>('evolucao');

  if (isPending) return <Skeleton className="h-24 w-full" aria-label="Carregando" />;
  if (isError || !data) {
    return (
      <div className="grid gap-4">
        <Button variant="ghost" className="w-fit" onClick={onVoltar}>
          <ChevronLeftIcon aria-hidden />
          Voltar
        </Button>
        <Card>
          <CardContent className="py-6 text-center text-sm text-destructive" role="alert">
            Não foi possível carregar este atendimento.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { agendamento, atendimento } = data;
  const mostrarIniciar =
    podeIniciar &&
    !atendimento &&
    podeAtender(agendamento.status) &&
    agendamento.status !== 'ATENDIDO';

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-center gap-4 rounded-lg bg-primary px-4 py-4 text-primary-foreground">
        <Button
          variant="ghost"
          className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
          onClick={onVoltar}
        >
          <ChevronLeftIcon aria-hidden />
          Voltar
        </Button>
        <span className="flex size-10 items-center justify-center rounded-full bg-white/20">
          <UserRoundIcon aria-hidden className="size-5" />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="truncate text-lg font-semibold">{agendamento.pacienteNome}</h2>
          <p className="text-sm opacity-90">
            {agendamento.procedimento ?? 'Atendimento'} - {horaLocal(agendamento.inicio)} | Dr(a).{' '}
            {agendamento.profissionalNome}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusAgendamento status={agendamento.status} />
          {mostrarIniciar && (
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={iniciar.isPending}
              onClick={() => iniciar.mutate(agendamentoId)}
            >
              <PlayIcon aria-hidden />
              Iniciar Atendimento
            </Button>
          )}
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Seções do atendimento"
        className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1"
      >
        {ABAS.map(({ id, rotulo, icone: Icone }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`aba-${id}`}
            aria-selected={aba === id}
            aria-controls="painel-aba-atendimento"
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              aba === id
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setAba(id)}
          >
            <Icone aria-hidden className="size-4" />
            {rotulo}
          </button>
        ))}
      </div>
      <div id="painel-aba-atendimento" role="tabpanel" aria-labelledby={`aba-${aba}`}>
        {aba === 'evolucao' && (
          <AbaEvolucao agendamentoId={agendamentoId} atendimento={atendimento} />
        )}
        {aba === 'dados' && <AbaDados agendamentoId={agendamentoId} />}
      </div>
    </div>
  );
}
