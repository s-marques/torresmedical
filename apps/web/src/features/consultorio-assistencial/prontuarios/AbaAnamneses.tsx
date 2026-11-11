import type { Anamnese } from '@torres/shared';
import { ClipboardListIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarDataHora } from '@/lib/formatar';
import { ModalAnamnese } from './ModalAnamnese';
import { useAnamneses } from './use-prontuarios';

export interface AbaAnamnesesProps {
  pacienteId: string;
}

/** Aba "Anamneses": registros de anamnese vinculados ao prontuário. */
export function AbaAnamneses({ pacienteId }: Readonly<AbaAnamnesesProps>) {
  const [criando, setCriando] = useState(false);
  const { data, isPending } = useAnamneses(pacienteId);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Anamneses</CardTitle>
          <p className="text-sm text-muted-foreground">
            Registros de anamnese vinculados ao prontuário.
          </p>
        </div>
        <SePermitido permissao="consultorio-assistencial.prontuarios.criar">
          <Button type="button" onClick={() => setCriando(true)}>
            <PlusIcon aria-hidden />
            Nova Anamnese
          </Button>
        </SePermitido>
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className="h-32 w-full" aria-label="Carregando" />}
        {data && data.data.length === 0 && (
          <EmptyState icone={ClipboardListIcon} titulo="Nenhuma anamnese registrada." />
        )}
        {data && data.data.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {data.data.map((anamnese) => (
              <LinhaAnamnese key={anamnese.id} anamnese={anamnese} />
            ))}
          </ul>
        )}
      </CardContent>
      {criando && <ModalAnamnese pacienteId={pacienteId} onFechar={() => setCriando(false)} />}
    </Card>
  );
}

function LinhaAnamnese({ anamnese }: Readonly<{ anamnese: Anamnese }>) {
  return (
    <li className="grid gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {anamnese.profissionalNome ?? 'Sem profissional'}
        </span>
        <span className="text-sm text-muted-foreground">
          {formatarDataHora(anamnese.createdAt)}
        </span>
      </div>
      {(anamnese.queixaPrincipal ?? anamnese.hipoteseDiagnostica) && (
        <p className="text-sm">{anamnese.queixaPrincipal ?? anamnese.hipoteseDiagnostica}</p>
      )}
    </li>
  );
}
