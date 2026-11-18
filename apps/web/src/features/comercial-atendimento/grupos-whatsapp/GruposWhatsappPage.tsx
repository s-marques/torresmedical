import {
  grupoWhatsappPageSchema,
  listGruposWhatsappQuerySchema,
  type GrupoWhatsapp,
} from '@torres/shared';
import { UsersRoundIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid } from '@/components/shared/data-grid/tipos';
import { EmptyState } from '@/components/shared/EmptyState';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { PageHeader } from '@/components/shared/PageHeader';
import { Label } from '@/components/ui/label';

const URL_GRUPOS = '/api/comercial-atendimento/grupos-whatsapp';

const COLUNAS: ColunaGrid<GrupoWhatsapp>[] = [
  { id: 'nome', titulo: 'Grupo', ordenavel: true, ocultavel: false },
  { id: 'participantes', titulo: 'Participantes', ordenavel: true },
  { id: 'id', titulo: 'ID do grupo', className: 'font-mono text-xs' },
];

/** Tela Grupos WhatsApp (`/grupos-whatsapp`): escolhe o canal e lista os grupos dele. */
export default function GruposWhatsappPage() {
  const idCanal = useId();
  const [canalId, setCanalId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader titulo="Grupos WhatsApp" />
      <div className="flex max-w-sm flex-col gap-2">
        <Label htmlFor={idCanal}>Canal WhatsApp</Label>
        <EntitySelect
          id={idCanal}
          entidade="canais-whatsapp"
          value={canalId}
          onChange={setCanalId}
          placeholder="Selecione o canal"
          placeholderBusca="Buscar canal…"
          permitirLimpar={false}
        />
      </div>
      {canalId ? (
        <DataGrid
          url={URL_GRUPOS}
          schema={grupoWhatsappPageSchema}
          querySchema={listGruposWhatsappQuerySchema}
          colunas={COLUNAS}
          consultaFixa={{ canalId }}
          busca="Buscar grupos..."
          mensagemVazio="Nenhum grupo encontrado."
          resumo={(meta) => `${meta.total} grupo(s)`}
        />
      ) : (
        <EmptyState icone={UsersRoundIcon} titulo="Selecione um canal para listar os grupos." />
      )}
    </div>
  );
}
