import type { ContadoresConversasWhatsapp, ConversaWhatsapp } from '@torres/shared';
import { MessageSquareIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Chip } from './Chip';
import { FILTROS_STATUS, type FiltroStatusConversa } from './filtros-status';
import { ItemConversa } from './ItemConversa';
import { useConversas } from './use-whatsapp';

export function ChipsStatusConversa({
  valor,
  contadores,
  onChange,
}: Readonly<{
  valor: FiltroStatusConversa;
  contadores?: ContadoresConversasWhatsapp;
  onChange: (valor: FiltroStatusConversa) => void;
}>) {
  return (
    <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-1.5 px-4">
      {FILTROS_STATUS.map(({ valor: opcao, rotulo, contador }) => {
        const quantidade = contador && contadores ? contadores[contador] : 0;
        return (
          <Chip key={opcao} tamanho="sm" ativo={valor === opcao} onClick={() => onChange(opcao)}>
            {rotulo}
            {quantidade > 0 && <span className="font-semibold">{quantidade}</span>}
          </Chip>
        );
      })}
    </div>
  );
}

export interface ListaConversasProps {
  canalId?: string;
  status: FiltroStatusConversa;
  selecionadaId: string | null;
  onSelecionar: (conversa: ConversaWhatsapp) => void;
}

/** Conversas do canal e status escolhidos; a próxima página carrega ao rolar até o fim. */
export function ListaConversas({
  canalId,
  status,
  selecionadaId,
  onSelecionar,
}: Readonly<ListaConversasProps>) {
  const alertas = status === 'alertas';
  const consulta = useConversas({ canalId, status: alertas ? 'aguardando' : status }, !alertas);
  const conversas = alertas ? [] : (consulta.data?.pages.flatMap((p) => p.data) ?? []);
  const fim = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = consulta;

  useEffect(() => {
    const alvo = fim.current;
    if (!alvo || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observador = new IntersectionObserver(([entrada]) => {
      if (entrada?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    });
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!alertas && consulta.isPending) {
    return (
      <p role="status" className="px-4 py-10 text-center text-sm text-muted-foreground">
        Carregando…
      </p>
    );
  }
  if (!alertas && consulta.isError) {
    return (
      <p role="alert" className="px-4 py-10 text-center text-sm text-destructive">
        Não foi possível carregar as conversas.
      </p>
    );
  }
  if (conversas.length === 0) {
    return <EmptyState icone={MessageSquareIcon} titulo="Nenhuma conversa encontrada" />;
  }
  return (
    <div aria-label="Conversas" role="list">
      {conversas.map((conversa) => (
        <div role="listitem" key={conversa.id}>
          <ItemConversa
            conversa={conversa}
            selecionada={conversa.id === selecionadaId}
            onSelecionar={onSelecionar}
          />
        </div>
      ))}
      <div ref={fim} aria-hidden className="h-px" />
      {isFetchingNextPage && (
        <p role="status" className="py-3 text-center text-xs text-muted-foreground">
          Carregando…
        </p>
      )}
    </div>
  );
}
