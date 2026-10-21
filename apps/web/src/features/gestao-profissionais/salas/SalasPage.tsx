import {
  BarChart3Icon,
  CalendarIcon,
  DoorOpenIcon,
  FileTextIcon,
  PlusIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AbaSalas } from './AbaSalas';

type IdAba = 'salas' | 'contratos' | 'mapa' | 'dashboard';

const ABAS: readonly { id: IdAba; rotulo: string; icone: LucideIcon }[] = [
  { id: 'salas', rotulo: 'Salas', icone: DoorOpenIcon },
  { id: 'contratos', rotulo: 'Contratos', icone: FileTextIcon },
  { id: 'mapa', rotulo: 'Mapa Ocupação', icone: CalendarIcon },
  { id: 'dashboard', rotulo: 'Dashboard', icone: BarChart3Icon },
];

const BREADCRUMB = [
  { rotulo: 'Painel', para: '/' },
  { rotulo: 'Gestão Profissionais' },
  { rotulo: 'Salas' },
];

/**
 * Gestão de Salas (`/salas`, docs/inventario/telas/gestao-profissionais-salas.md): salas,
 * contratos, mapa de ocupação e dashboard, em quatro abas. Contratos, Mapa e Dashboard
 * dependem do cadastro de contratos e entram em PRs seguintes da #57.
 */
export default function SalasPage() {
  const [aba, setAba] = useState<IdAba>('salas');
  const [criando, setCriando] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Gestão de Salas"
        descricao="Controle de aluguel de salas para profissionais"
        breadcrumb={BREADCRUMB}
        acoes={
          aba === 'salas' && (
            <SePermitido permissao="gestao-profissionais.salas.criar">
              <Button type="button" onClick={() => setCriando(true)}>
                <PlusIcon aria-hidden />
                Nova Sala
              </Button>
            </SePermitido>
          )
        }
      />
      <div
        role="tablist"
        aria-label="Seções de Gestão de Salas"
        className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1"
      >
        {ABAS.map(({ id, rotulo, icone: Icone }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`aba-${id}`}
            aria-selected={aba === id}
            aria-controls="painel-aba"
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
      <div id="painel-aba" role="tabpanel" aria-labelledby={`aba-${aba}`}>
        {aba === 'salas' ? (
          <AbaSalas criando={criando} onFecharCriar={() => setCriando(false)} />
        ) : (
          <EmptyState
            icone={ABAS.find((a) => a.id === aba)?.icone}
            titulo="Em construção"
            descricao="Esta aba será entregue em uma próxima etapa da tela Salas."
          />
        )}
      </div>
    </div>
  );
}
