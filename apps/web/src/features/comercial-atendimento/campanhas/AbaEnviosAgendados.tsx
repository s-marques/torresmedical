import { CAMPANHA_STATUS_ROTULO, type Campanha, type CampanhaStatus } from '@torres/shared';
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermissao } from '@/lib/auth/use-sessao';
import { formatarDataHora } from '@/lib/formatar';
import { ModalCampanha } from './ModalCampanha';
import { descreverFiltro } from './textos';
import { useCampanhas, useCancelarCampanha, useExcluirCampanha } from './use-campanhas';

const COR_STATUS: Readonly<Record<CampanhaStatus, string>> = {
  AGENDADA: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  ENVIANDO: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  CONCLUIDA: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELADA: 'bg-muted text-muted-foreground',
};

function BotaoNova({ onClick }: Readonly<{ onClick: () => void }>) {
  return (
    <SePermitido permissao="comercial-atendimento.campanhas.criar">
      <Button type="button" onClick={onClick}>
        <PlusIcon aria-hidden />
        Nova Campanha
      </Button>
    </SePermitido>
  );
}

function CartaoCampanha({
  campanha,
  onEditar,
  onCancelar,
  onExcluir,
}: Readonly<{
  campanha: Campanha;
  onEditar: () => void;
  onCancelar: () => void;
  onExcluir: () => void;
}>) {
  const podeEditar = usePermissao('comercial-atendimento.campanhas.editar');
  const podeExcluir = usePermissao('comercial-atendimento.campanhas.excluir');
  const agendada = campanha.status === 'AGENDADA';
  const cancelavel = agendada || campanha.status === 'ENVIANDO';
  const acoes = [
    podeEditar && agendada && { rotulo: 'Editar', icone: PencilIcon, onSelect: onEditar },
    podeEditar && cancelavel && { rotulo: 'Cancelar', icone: XIcon, onSelect: onCancelar },
    podeExcluir &&
      campanha.status !== 'ENVIANDO' && {
        rotulo: 'Excluir',
        icone: Trash2Icon,
        onSelect: onExcluir,
      },
  ].filter((a) => a !== false);

  return (
    <li className="flex flex-wrap items-start gap-3 rounded-lg border bg-card p-4">
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{campanha.nome}</span>
          <Badge variant="secondary" className={COR_STATUS[campanha.status]}>
            {CAMPANHA_STATUS_ROTULO[campanha.status]}
          </Badge>
          <Badge variant="outline">{descreverFiltro(campanha)}</Badge>
        </div>
        <p className="truncate text-sm text-muted-foreground">{campanha.mensagem}</p>
      </div>
      <div className="grid justify-items-end gap-1 text-sm text-muted-foreground">
        <span>{formatarDataHora(campanha.agendadaPara)}</span>
        <span>{campanha.canal}</span>
        {campanha.totalDestinatarios > 0 && (
          <span className="text-emerald-700 dark:text-emerald-400">
            {campanha.totalEnviados}/{campanha.totalDestinatarios} enviados
          </span>
        )}
      </div>
      {acoes.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Ações de ${campanha.nome}`}
            >
              <MoreHorizontalIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {acoes.map(({ rotulo, icone: Icone, onSelect }) => (
              <DropdownMenuItem key={rotulo} onSelect={onSelect}>
                <Icone aria-hidden /> {rotulo}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

/** Aba "Envios Agendados": campanhas em cartões, com Nova Campanha e o estado vazio. */
export function AbaEnviosAgendados() {
  const campanhas = useCampanhas();
  const cancelar = useCancelarCampanha();
  const excluir = useExcluirCampanha();
  const [modal, setModal] = useState<{ campanha?: Campanha } | null>(null);
  const [cancelando, setCancelando] = useState<Campanha | null>(null);
  const [excluindo, setExcluindo] = useState<Campanha | null>(null);
  const lista = campanhas.data?.data ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {campanhas.data?.meta.total ?? 0} campanha(s)
        </span>
        <BotaoNova onClick={() => setModal({})} />
      </div>
      {campanhas.isError && (
        <p className="text-sm text-destructive">Não foi possível carregar as campanhas.</p>
      )}
      {campanhas.isSuccess && lista.length === 0 && (
        <div className="grid justify-items-center gap-2 rounded-lg border bg-card p-10 text-center">
          <SendIcon aria-hidden className="size-10 text-muted-foreground" />
          <p className="font-semibold">Nenhuma campanha</p>
          <p className="text-sm text-muted-foreground">
            Crie sua primeira campanha de envio em massa.
          </p>
          <BotaoNova onClick={() => setModal({})} />
        </div>
      )}
      {lista.length > 0 && (
        <ul className="grid gap-3" aria-label="Campanhas">
          {lista.map((c) => (
            <CartaoCampanha
              key={c.id}
              campanha={c}
              onEditar={() => setModal({ campanha: c })}
              onCancelar={() => setCancelando(c)}
              onExcluir={() => setExcluindo(c)}
            />
          ))}
        </ul>
      )}
      {modal && <ModalCampanha campanha={modal.campanha} onFechar={() => setModal(null)} />}
      <ConfirmDialog
        aberto={cancelando !== null}
        onAbertoChange={(aberto) => aberto || setCancelando(null)}
        titulo="Cancelar Campanha"
        descricao={`Tem certeza que deseja cancelar a campanha "${cancelando?.nome ?? ''}"? Os envios que ainda não saíram não serão feitos.`}
        onConfirmar={() => (cancelando ? cancelar.mutateAsync(cancelando.id) : undefined)}
      />
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Campanha"
        descricao={`Tem certeza que deseja excluir a campanha "${excluindo?.nome ?? ''}"? Esta ação não pode ser desfeita.`}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
