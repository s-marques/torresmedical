import type { TipoAgendamento } from '@torres/shared';
import { CalendarCogIcon, ClockIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ModalTipoAgendamento } from './ModalTipoAgendamento';
import { useExcluirTipo, useTiposAgendamento } from './use-tipos-agendamento';

const BREADCRUMB = [
  { rotulo: 'Painel', para: '/' },
  { rotulo: 'Configurações' },
  { rotulo: 'Tipos de Agendamento' },
];

function chips(tipo: TipoAgendamento): string[] {
  return [
    tipo.permiteProcedimento && 'Procedimento',
    tipo.permitePacote && 'Pacote',
    tipo.soroterapia && 'Soroterapia',
  ].filter((chip): chip is string => chip !== false);
}

interface CardTipoProps {
  tipo: TipoAgendamento;
  onEditar: () => void;
  onExcluir: () => void;
}

function CardTipo({ tipo, onEditar, onExcluir }: Readonly<CardTipoProps>) {
  return (
    <li className="grid gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            data-testid="cor-tipo"
            className="size-3.5 shrink-0 rounded-full"
            style={{ backgroundColor: tipo.cor ?? undefined }}
          />
          <h2 className="truncate text-base font-medium">{tipo.nome}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SePermitido permissao="configuracoes-gestao.tipos-agendamento.editar">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar ${tipo.nome}`}
              onClick={onEditar}
            >
              <PencilIcon aria-hidden />
            </Button>
          </SePermitido>
          <SePermitido permissao="configuracoes-gestao.tipos-agendamento.excluir">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label={`Excluir ${tipo.nome}`}
              onClick={onExcluir}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </SePermitido>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          <ClockIcon aria-hidden />
          {tipo.duracaoMinutos} min
        </Badge>
        {chips(tipo).map((chip) => (
          <Badge key={chip} variant="secondary">
            {chip}
          </Badge>
        ))}
      </div>
    </li>
  );
}

/**
 * Tipos de Agendamento (`/config/tipos-agendamento`,
 * docs/inventario/telas/configuracoes-gestao-tipos-de-agendamento.md): tipos de
 * consulta/procedimento disponíveis na agenda, em cards (sem tabela, busca ou paginação).
 */
export default function TiposAgendamentoPage() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<TipoAgendamento | null>(null);
  const [excluindo, setExcluindo] = useState<TipoAgendamento | null>(null);
  const tipos = useTiposAgendamento();
  const excluir = useExcluirTipo();

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Tipos de Agendamento"
        descricao="Cadastre e gerencie os tipos de consulta/procedimento disponíveis na agenda."
        breadcrumb={BREADCRUMB}
        acoes={
          <SePermitido permissao="configuracoes-gestao.tipos-agendamento.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Novo Tipo
            </Button>
          </SePermitido>
        }
      />
      {tipos.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-24 rounded-xl" />
          ))}
        </div>
      )}
      {tipos.isError && (
        <EmptyState
          titulo="Não foi possível carregar os tipos de agendamento."
          acao={
            <Button type="button" variant="outline" onClick={() => void tipos.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}
      {tipos.data && tipos.data.data.length === 0 && (
        <EmptyState icone={CalendarCogIcon} titulo="Nenhum tipo de agendamento cadastrado." />
      )}
      {tipos.data && tipos.data.data.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tipos.data.data.map((tipo) => (
            <CardTipo
              key={tipo.id}
              tipo={tipo}
              onEditar={() => setEditando(tipo)}
              onExcluir={() => setExcluindo(tipo)}
            />
          ))}
        </ul>
      )}
      {criando && <ModalTipoAgendamento onFechar={() => setCriando(false)} />}
      {editando && <ModalTipoAgendamento tipo={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir tipo"
        descricao={`Deseja excluir o tipo "${excluindo?.nome ?? ''}"? Agendamentos existentes com este tipo não serão afetados.`}
        rotuloConfirmar="Confirmar"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
