import type { MensagemWhatsapp } from '@torres/shared';
import { MessageSquareIcon } from 'lucide-react';
import { Fragment, useEffect, useRef } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { rotuloDoDia } from './formatar';
import { MensagemBalao } from './MensagemBalao';

export interface ListaMensagensProps {
  /** Da mais antiga para a mais recente. */
  mensagens: readonly MensagemWhatsapp[];
  carregando: boolean;
  temAnteriores: boolean;
  carregandoAnteriores: boolean;
  onCarregarAnteriores: () => void;
  /** Muda ao abrir outra conversa: volta a rolar para o fim. */
  conversaId: string;
}

function chaveDoDia(iso: string): string {
  const data = new Date(iso);
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
}

/** Linha do tempo da conversa, com um separador por dia ("Hoje", "25/09/2026"). */
export function ListaMensagens({
  mensagens,
  carregando,
  temAnteriores,
  carregandoAnteriores,
  onCarregarAnteriores,
  conversaId,
}: Readonly<ListaMensagensProps>) {
  const area = useRef<HTMLDivElement>(null);
  const ultimaId = mensagens.at(-1)?.id;

  // Abre no fim e acompanha as mensagens novas. Carregar as anteriores não muda a última.
  useEffect(() => {
    const el = area.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversaId, ultimaId]);

  if (carregando) {
    return (
      <p role="status" className="flex-1 p-6 text-center text-sm text-muted-foreground">
        Carregando…
      </p>
    );
  }
  if (mensagens.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState icone={MessageSquareIcon} titulo="Nenhuma mensagem nesta conversa." />
      </div>
    );
  }
  return (
    <div ref={area} aria-label="Mensagens" className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
      <div className="grid gap-3">
        {temAnteriores && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mx-auto"
            disabled={carregandoAnteriores}
            onClick={onCarregarAnteriores}
          >
            {carregandoAnteriores ? 'Carregando…' : 'Carregar mensagens anteriores'}
          </Button>
        )}
        {mensagens.map((mensagem, i) => {
          const novoDia =
            chaveDoDia(mensagem.enviadaEm) !== chaveDoDia(mensagens[i - 1]?.enviadaEm ?? '');
          return (
            <Fragment key={mensagem.id}>
              {novoDia && (
                <p className="mx-auto rounded-full bg-muted px-3 py-0.5 text-xs text-muted-foreground">
                  {rotuloDoDia(new Date(mensagem.enviadaEm))}
                </p>
              )}
              <MensagemBalao mensagem={mensagem} />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
