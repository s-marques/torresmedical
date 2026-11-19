import {
  EyeIcon,
  FileTextIcon,
  LinkIcon,
  ClipboardListIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AbaAnamneses } from './AbaAnamneses';
import { AbaAtendimentos } from './AbaAtendimentos';
import { AbaHistoricoClinico } from './AbaHistoricoClinico';
import { AbaProntuario } from './AbaProntuario';
import { AbaReceitas } from './AbaReceitas';
import { CardPacientesComRegistros } from './CardPacientesComRegistros';
import { PacienteHeaderProntuario } from './PacienteHeaderProntuario';
import { useHistoricoClinico, usePacienteResumo } from './use-prontuarios';

type IdAba = 'prontuario' | 'atendimentos' | 'receitas' | 'anamneses' | 'historico';

const ABAS: readonly { id: IdAba; rotulo: string; icone: LucideIcon }[] = [
  { id: 'prontuario', rotulo: 'Prontuario', icone: FileTextIcon },
  { id: 'atendimentos', rotulo: 'Atendimentos', icone: ZapIcon },
  { id: 'receitas', rotulo: 'Receitas', icone: LinkIcon },
  { id: 'anamneses', rotulo: 'Anamneses', icone: ClipboardListIcon },
  { id: 'historico', rotulo: 'Histórico Clínico', icone: EyeIcon },
];

/** Tela Prontuários (`/prontuarios`, docs/inventario/telas/consultorio-assistencial-prontuarios.md). */
export default function ProntuariosPage() {
  const [pacienteId, setPacienteId] = useState<string | null>(null);
  const [aba, setAba] = useState<IdAba>('prontuario');

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Prontuarios"
        descricao="Busque um paciente para acessar seu prontuario medico completo."
      />
      <EntitySelect
        entidade="pacientes"
        value={pacienteId}
        onChange={(id) => {
          setPacienteId(id);
          setAba('prontuario');
        }}
        placeholder="Buscar paciente por nome, CPF ou telefone…"
        placeholderBusca="Buscar paciente…"
        aria-label="Buscar paciente"
        className="max-w-xl"
      />

      {!pacienteId && <CardPacientesComRegistros onSelecionar={setPacienteId} />}

      {pacienteId && (
        <DetalhePaciente key={pacienteId} pacienteId={pacienteId} aba={aba} onAba={setAba} />
      )}
    </div>
  );
}

function DetalhePaciente({
  pacienteId,
  aba,
  onAba,
}: Readonly<{ pacienteId: string; aba: IdAba; onAba: (aba: IdAba) => void }>) {
  const { data: paciente, isPending, isError } = usePacienteResumo(pacienteId);
  const historico = useHistoricoClinico(pacienteId);

  if (isPending) return <Skeleton className="h-24 w-full" aria-label="Carregando" />;
  if (isError || !paciente) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-destructive" role="alert">
          Não foi possível carregar este paciente.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <PacienteHeaderProntuario paciente={paciente} />
      <div
        role="tablist"
        aria-label="Seções do prontuário"
        className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1"
      >
        {ABAS.map(({ id, rotulo, icone: Icone }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`aba-${id}`}
            aria-selected={aba === id}
            aria-controls="painel-aba-prontuario"
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              aba === id
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onAba(id)}
          >
            <Icone aria-hidden className="size-4" />
            {rotulo}
            {id === 'historico' && historico.data && historico.data.meta.total > 0 && (
              <Badge variant="secondary" className="px-1.5">
                {historico.data.meta.total}
              </Badge>
            )}
          </button>
        ))}
      </div>
      <div id="painel-aba-prontuario" role="tabpanel" aria-labelledby={`aba-${aba}`}>
        {aba === 'prontuario' && <AbaProntuario pacienteId={pacienteId} />}
        {aba === 'atendimentos' && <AbaAtendimentos pacienteId={pacienteId} />}
        {aba === 'receitas' && <AbaReceitas pacienteId={pacienteId} />}
        {aba === 'anamneses' && <AbaAnamneses pacienteId={pacienteId} />}
        {aba === 'historico' && <AbaHistoricoClinico pacienteId={pacienteId} />}
      </div>
    </div>
  );
}
