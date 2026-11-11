import type { PacienteComRegistros } from '@torres/shared';
import { ChevronRightIcon, SearchIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarData } from '@/lib/formatar';
import { useDebounce } from '@/hooks/use-debounce';
import { usePacientesComRegistros } from './use-prontuarios';

export interface CardPacientesComRegistrosProps {
  onSelecionar: (pacienteId: string) => void;
}

/** Duas primeiras iniciais do nome, para o avatar da linha. */
function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('');
}

/** Card "Pacientes com Prontuário": lista de acesso rápido a quem já tem registro clínico. */
export function CardPacientesComRegistros({
  onSelecionar,
}: Readonly<CardPacientesComRegistrosProps>) {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const buscaAtrasada = useDebounce(busca.trim(), 300);
  const { data, isPending, isError } = usePacientesComRegistros(buscaAtrasada, pagina);

  function filtrar(valor: string) {
    setBusca(valor);
    setPagina(1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pacientes com Prontuário</CardTitle>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.meta.total} paciente(s) com registros clínicos` : 'Carregando…'}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="relative">
          <SearchIcon
            aria-hidden
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={busca}
            onChange={(evento) => filtrar(evento.target.value)}
            placeholder="Filtrar por nome, CPF…"
            className="pl-9"
            aria-label="Filtrar pacientes com prontuário"
          />
        </div>

        {isPending && <Skeleton className="h-48 w-full" aria-label="Carregando" />}
        {isError && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar os pacientes.
          </p>
        )}
        {data && data.data.length === 0 && (
          <EmptyState icone={UsersIcon} titulo="Nenhum paciente com registro clínico encontrado." />
        )}
        {data && data.data.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {data.data.map((paciente) => (
              <LinhaPaciente key={paciente.id} paciente={paciente} onSelecionar={onSelecionar} />
            ))}
          </ul>
        )}

        {data && data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span>
              Página {data.meta.page} de {data.meta.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pagina >= data.meta.totalPages}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LinhaPaciente({
  paciente,
  onSelecionar,
}: Readonly<{ paciente: PacienteComRegistros; onSelecionar: (id: string) => void }>) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelecionar(paciente.id)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
          {iniciais(paciente.nome)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{paciente.nome}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {[paciente.documento, paciente.celular ?? paciente.telefone]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className="shrink-0 text-right text-sm">
          <span className="block font-medium text-primary">
            {paciente.totalRegistros} registro(s)
          </span>
          <span className="block text-muted-foreground">
            Último: {formatarData(paciente.ultimoRegistro)}
          </span>
        </span>
        <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}
