import { type ProtocoloMae } from '@torres/shared';
import { LayersIcon, PencilIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { rotuloSemanas } from './rotulos';
import { ModalProtocoloMae } from './ModalProtocoloMae';
import { useExcluirProtocoloMae, useProtocolosMae } from './use-protocolos';

function agruparPorCategoria<T extends { categoria: string }>(itens: readonly T[]) {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    grupos.set(item.categoria, [...(grupos.get(item.categoria) ?? []), item]);
  }
  return [...grupos.entries()];
}

function CardProtocoloMae({
  mae,
  onEditar,
  onExcluir,
}: Readonly<{ mae: ProtocoloMae; onEditar: () => void; onExcluir: () => void }>) {
  const [aberto, setAberto] = useState(false);
  return (
    <li className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{mae.nome}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {mae.valorTotal > 0 && (
              <Badge variant="secondary">{formatarMoeda(mae.valorTotal)}</Badge>
            )}
            <Badge variant="secondary">{rotuloSemanas(mae.totalSemanas)}</Badge>
            {!aberto && mae.descricao && (
              <span className="max-w-md truncate text-muted-foreground">{mae.descricao}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant={aberto ? 'outline' : 'ghost'}
            size="sm"
            aria-expanded={aberto}
            aria-label={`${aberto ? 'Fechar' : 'Detalhar'} ${mae.nome}`}
            onClick={() => setAberto(!aberto)}
          >
            <SearchIcon aria-hidden />
            {aberto ? 'Fechar' : 'Detalhar'}
          </Button>
          <SePermitido permissao="gestao-profissionais.protocolos.editar">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar ${mae.nome}`}
              title="Editar"
              onClick={onEditar}
            >
              <PencilIcon aria-hidden />
            </Button>
          </SePermitido>
          <SePermitido permissao="gestao-profissionais.protocolos.excluir">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label={`Excluir ${mae.nome}`}
              title="Excluir"
              onClick={onExcluir}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </SePermitido>
        </div>
      </div>
      {aberto && (
        <div className="mt-3 grid gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          {mae.descricao && <p className="whitespace-pre-line">{mae.descricao}</p>}
          <ul className="grid gap-1">
            {mae.semanas.map((semana) => (
              <li key={semana.semana} className="rounded bg-background px-2 py-1">
                <span className="font-semibold text-primary">Semana {semana.semana}:</span>{' '}
                {semana.protocoloNome ?? 'Sem protocolo'}
                {semana.observacoes && (
                  <span className="text-muted-foreground"> — {semana.observacoes}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/** Aba "Protocolos Mãe": protocolos encadeados, um por semana. */
export function ProtocolosMaeAba({
  criando,
  onFecharCriar,
}: Readonly<{ criando: boolean; onFecharCriar: () => void }>) {
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<ProtocoloMae | null>(null);
  const [excluindo, setExcluindo] = useState<ProtocoloMae | null>(null);
  const maes = useProtocolosMae(pagina);
  const excluir = useExcluirProtocoloMae();
  const dados = maes.data;

  return (
    <div className="grid gap-4">
      {maes.isPending && <Skeleton className="h-24 rounded-xl" aria-busy />}
      {maes.isError && (
        <EmptyState
          titulo="Não foi possível carregar os protocolos mãe."
          acao={
            <Button type="button" variant="outline" onClick={() => void maes.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}
      {dados && dados.data.length === 0 && (
        <div className="rounded-xl border bg-card">
          <EmptyState icone={LayersIcon} titulo="Nenhum protocolo mãe cadastrado" />
        </div>
      )}
      {dados &&
        agruparPorCategoria(dados.data).map(([categoria, grupo]) => (
          <section key={categoria} className="grid gap-2 rounded-xl border bg-card p-4">
            <h2 className="font-semibold">
              {categoria}{' '}
              <span className="text-sm font-normal text-muted-foreground">({grupo.length})</span>
            </h2>
            <ul className="grid gap-2">
              {grupo.map((mae) => (
                <CardProtocoloMae
                  key={mae.id}
                  mae={mae}
                  onEditar={() => setEditando(mae)}
                  onExcluir={() => setExcluindo(mae)}
                />
              ))}
            </ul>
          </section>
        ))}
      {dados && dados.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pagina <= 1}
            onClick={() => setPagina(pagina - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {pagina} de {dados.meta.totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={pagina >= dados.meta.totalPages}
            onClick={() => setPagina(pagina + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
      {criando && <ModalProtocoloMae onFechar={onFecharCriar} />}
      {editando && <ModalProtocoloMae mae={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir protocolo mãe?"
        descricao={`O protocolo mãe "${excluindo?.nome ?? ''}" será excluído. Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
