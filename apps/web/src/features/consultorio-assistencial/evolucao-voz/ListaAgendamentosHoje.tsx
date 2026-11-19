import type { EvolucaoVozAgendamento } from '@torres/shared';
import { CalendarIcon, PlayIcon, SearchIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/use-debounce';
import { hojeISO } from '@/lib/datas';
import { cn } from '@/lib/utils';
import { StatusAgendamento } from '../atendimento-medico/StatusAgendamento';
import { useAgendamentosHoje } from './use-evolucao-voz';

const ATRASO_BUSCA_MS = 300;

export interface ListaAgendamentosHojeProps {
  onAbrir: (agendamentoId: string) => void;
}

/**
 * "Agendamentos de Hoje" (print do inventário). "Buscar paciente" mostra os campos Paciente e
 * Profissional, que filtram a lista do dia (confirmado pelo dev).
 */
export function ListaAgendamentosHoje({ onAbrir }: Readonly<ListaAgendamentosHojeProps>) {
  const [buscando, setBuscando] = useState(false);
  const [paciente, setPaciente] = useState('');
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const search = useDebounce(paciente.trim(), ATRASO_BUSCA_MS);
  const idPaciente = useId();
  const idProfissional = useId();
  const { data, isPending, isError } = useAgendamentosHoje({
    data: hojeISO(),
    search,
    profissionalId,
  });

  return (
    <Card className="max-w-3xl">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarIcon aria-hidden className="size-4" />
          Agendamentos de Hoje
        </CardTitle>
        <Button
          type="button"
          variant={buscando ? 'secondary' : 'ghost'}
          size="sm"
          aria-expanded={buscando}
          onClick={() => setBuscando((atual) => !atual)}
        >
          <SearchIcon aria-hidden />
          Buscar paciente
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        {isPending && <Skeleton className="h-16 w-full" aria-label="Carregando" />}
        {isError && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar os agendamentos.
          </p>
        )}
        {data && data.data.length === 0 && (
          <p role="status" className="py-4 text-center text-sm text-muted-foreground">
            Nenhum agendamento encontrado para hoje.
          </p>
        )}
        {data && data.data.length > 0 && (
          <ul className="grid gap-2" aria-label="Agendamentos de hoje">
            {data.data.map((agendamento) => (
              <LinhaAgendamento key={agendamento.id} agendamento={agendamento} onAbrir={onAbrir} />
            ))}
          </ul>
        )}
        {buscando && (
          <>
            <Separator />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={idPaciente}>Paciente</Label>
                <Input
                  id={idPaciente}
                  value={paciente}
                  placeholder="Digite o nome..."
                  onChange={(evento) => setPaciente(evento.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={idProfissional}>Profissional</Label>
                <EntitySelect
                  id={idProfissional}
                  entidade="profissionais"
                  value={profissionalId}
                  onChange={(id) => setProfissionalId(id)}
                  placeholder="Selecione"
                  permitirLimpar
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LinhaAgendamento({
  agendamento,
  onAbrir,
}: Readonly<{ agendamento: EvolucaoVozAgendamento; onAbrir: (id: string) => void }>) {
  const detalhe = [agendamento.profissionalNome, agendamento.procedimento]
    .filter(Boolean)
    .join(' — ');
  return (
    <li>
      <button
        type="button"
        aria-label={`Gravar evolução de ${agendamento.pacienteNome}`}
        onClick={() => onAbrir(agendamento.id)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
          'hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        )}
      >
        <span aria-hidden className="size-10 shrink-0 rounded-full bg-primary/10" />
        <span className="grid min-w-0 flex-1">
          <span className="truncate font-medium">{agendamento.pacienteNome}</span>
          <span className="truncate text-xs text-muted-foreground">{detalhe}</span>
        </span>
        <StatusAgendamento status={agendamento.status} />
        <PlayIcon aria-hidden className="size-4 shrink-0 text-primary" />
      </button>
    </li>
  );
}
