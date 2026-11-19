import { formatarNumeroReceita, RECEITUARIO_TIPO_ROTULOS, type Prescricao } from '@torres/shared';
import { FileTextIcon } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarData } from '@/lib/formatar';
import { useReceitas } from './use-prontuarios';

export interface AbaReceitasProps {
  pacienteId: string;
}

/**
 * Aba "Receitas": prescrições do paciente emitidas na tela Receituários (#42), somente leitura.
 * Mostra só as dos profissionais no escopo do usuário (issue #153).
 */
export function AbaReceitas({ pacienteId }: Readonly<AbaReceitasProps>) {
  const { data, isPending } = useReceitas(pacienteId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receitas</CardTitle>
        <p className="text-sm text-muted-foreground">
          Prescrições em receituário controlado emitidas para o paciente.
        </p>
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className="h-32 w-full" aria-label="Carregando" />}
        {data && data.data.length === 0 && (
          <EmptyState icone={FileTextIcon} titulo="Nenhuma receita registrada." />
        )}
        {data && data.data.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {data.data.map((prescricao) => (
              <LinhaReceita key={prescricao.id} prescricao={prescricao} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LinhaReceita({ prescricao }: Readonly<{ prescricao: Prescricao }>) {
  return (
    <li className="grid gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{RECEITUARIO_TIPO_ROTULOS[prescricao.tipo]}</Badge>
          <span className="font-mono text-sm">nº {formatarNumeroReceita(prescricao.numero)}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {formatarData(prescricao.dataPrescricao)}
        </span>
      </div>
      <p className="text-sm whitespace-pre-line">{prescricao.medicacao}</p>
      {prescricao.posologia && (
        <p className="text-sm whitespace-pre-line text-muted-foreground">{prescricao.posologia}</p>
      )}
      <span className="text-sm text-muted-foreground">
        {prescricao.profissionalNome ?? 'Sem profissional'}
      </span>
    </li>
  );
}
