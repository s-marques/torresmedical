import type { Sala } from '@torres/shared';
import { DoorOpenIcon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CardSala } from './CardSala';
import { ModalDetalhesSala } from './ModalDetalhesSala';
import { ModalSala } from './ModalSala';
import { useExcluirSala, useSalas } from './use-salas';

export interface AbaSalasProps {
  criando: boolean;
  onFecharCriar: () => void;
}

/** Aba Salas: cards das salas, com Detalhar (lupa), Editar (lápis) e Excluir (lixeira). */
export function AbaSalas({ criando, onFecharCriar }: Readonly<AbaSalasProps>) {
  const [detalhando, setDetalhando] = useState<Sala | null>(null);
  const [editando, setEditando] = useState<Sala | null>(null);
  const [excluindo, setExcluindo] = useState<Sala | null>(null);
  const salas = useSalas();
  const excluir = useExcluirSala();
  const dados = salas.data;

  return (
    <div className="grid gap-4">
      {salas.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-40 rounded-xl" />
          ))}
        </div>
      )}
      {salas.isError && (
        <EmptyState
          titulo="Não foi possível carregar as salas."
          acao={
            <Button type="button" variant="outline" onClick={() => void salas.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}
      {dados && dados.data.length === 0 && (
        <EmptyState icone={DoorOpenIcon} titulo="Nenhuma sala cadastrada." />
      )}
      {dados && dados.data.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dados.data.map((sala) => (
            <CardSala
              key={sala.id}
              sala={sala}
              onDetalhar={() => setDetalhando(sala)}
              onEditar={() => setEditando(sala)}
              onExcluir={() => setExcluindo(sala)}
            />
          ))}
        </ul>
      )}
      {criando && <ModalSala onFechar={onFecharCriar} />}
      {editando && <ModalSala sala={editando} onFechar={() => setEditando(null)} />}
      {detalhando && (
        <ModalDetalhesSala
          sala={detalhando}
          onFechar={() => setDetalhando(null)}
          onEditar={() => {
            setEditando(detalhando);
            setDetalhando(null);
          }}
        />
      )}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir sala?"
        descricao={`A sala "${excluindo?.nome ?? ''}" será excluída. Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
