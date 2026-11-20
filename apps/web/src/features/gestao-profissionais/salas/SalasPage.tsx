import {
  BarChart3Icon,
  CalendarIcon,
  DoorOpenIcon,
  FileTextIcon,
  LockIcon,
  PlusIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AbaBloqueios } from './AbaBloqueios';
import { AbaContratos } from './AbaContratos';
import { AbaDashboard } from './AbaDashboard';
import { AbaMapa } from './AbaMapa';
import { AbaSalas } from './AbaSalas';

type IdAba = 'salas' | 'contratos' | 'bloqueios' | 'mapa' | 'dashboard';

/** `chave`: rótulo traduzido (aba nova da #138); as demais são traduzidas na #212. */
const ABAS: readonly { id: IdAba; rotulo: string; chave?: string; icone: LucideIcon }[] = [
  { id: 'salas', rotulo: 'Salas', icone: DoorOpenIcon },
  { id: 'contratos', rotulo: 'Contratos', icone: FileTextIcon },
  { id: 'bloqueios', rotulo: 'Bloqueios', chave: 'salasBloqueios.aba', icone: LockIcon },
  { id: 'mapa', rotulo: 'Mapa Ocupação', icone: CalendarIcon },
  { id: 'dashboard', rotulo: 'Dashboard', icone: BarChart3Icon },
];

const ROTULO_NOVO: Partial<Record<IdAba, string>> = {
  salas: 'Nova Sala',
  contratos: 'Novo Contrato',
};

const BREADCRUMB = [
  { rotulo: 'Painel', para: '/' },
  { rotulo: 'Gestão Profissionais' },
  { rotulo: 'Salas' },
];

/**
 * Gestão de Salas (`/salas`, docs/inventario/telas/gestao-profissionais-salas.md): salas,
 * contratos, bloqueios e reservas (issue #138), mapa de ocupação e dashboard, em cinco abas.
 */
export default function SalasPage() {
  const { t } = useTranslation();
  const [aba, setAba] = useState<IdAba>('salas');
  const [criando, setCriando] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Gestão de Salas"
        descricao="Controle de aluguel de salas para profissionais"
        breadcrumb={BREADCRUMB}
        acoes={
          (aba === 'salas' || aba === 'contratos' || aba === 'bloqueios') && (
            <SePermitido permissao="gestao-profissionais.salas.criar">
              <Button type="button" onClick={() => setCriando(true)}>
                <PlusIcon aria-hidden />
                {ROTULO_NOVO[aba] ?? t('salasBloqueios.novo')}
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
        {ABAS.map(({ id, rotulo, chave, icone: Icone }) => (
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
            {chave ? t(chave) : rotulo}
          </button>
        ))}
      </div>
      <div id="painel-aba" role="tabpanel" aria-labelledby={`aba-${aba}`}>
        {aba === 'salas' && <AbaSalas criando={criando} onFecharCriar={() => setCriando(false)} />}
        {aba === 'contratos' && (
          <AbaContratos criando={criando} onFecharCriar={() => setCriando(false)} />
        )}
        {aba === 'bloqueios' && (
          <AbaBloqueios criando={criando} onFecharCriar={() => setCriando(false)} />
        )}
        {aba === 'mapa' && <AbaMapa />}
        {aba === 'dashboard' && <AbaDashboard />}
      </div>
    </div>
  );
}
