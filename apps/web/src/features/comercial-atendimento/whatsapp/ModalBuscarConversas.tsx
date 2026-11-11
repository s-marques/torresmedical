import {
  BUSCA_CONVERSAS_MENSAGEM,
  BUSCA_CONVERSAS_MIN,
  type ConversaWhatsapp,
} from '@torres/shared';
import { MessageSquareIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Modal } from '@/components/shared/Modal';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { ItemConversa } from './ItemConversa';
import { useBuscaConversas } from './use-whatsapp';

/** Atraso da busca ao digitar. */
export const BUSCA_CONVERSAS_DEBOUNCE_MS = 300;

export interface ModalBuscarConversasProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  onSelecionar: (conversa: ConversaWhatsapp) => void;
}

/** Modal "Buscar Conversas": nome, telefone, tag ou palavra nas mensagens, em todas as conversas. */
export function ModalBuscarConversas({
  aberto,
  onAbertoChange,
  onSelecionar,
}: Readonly<ModalBuscarConversasProps>) {
  const [busca, setBusca] = useState('');
  const termo = useDebounce(busca.trim(), BUSCA_CONVERSAS_DEBOUNCE_MS);
  const curta = termo.length < BUSCA_CONVERSAS_MIN;
  const resultado = useBuscaConversas(curta ? '' : termo);
  const conversas = resultado.data?.data ?? [];

  function alterarAberto(novo: boolean) {
    if (!novo) setBusca('');
    onAbertoChange(novo);
  }

  return (
    <Modal aberto={aberto} onAbertoChange={alterarAberto} titulo="Buscar Conversas" tamanho="lg">
      <div className="grid gap-3">
        <div className="relative">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Buscar conversas"
            placeholder="Buscar por nome, telefone, tag ou palavra nas mensagens..."
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
        <ResultadoBusca
          curta={curta}
          carregando={resultado.isFetching && conversas.length === 0}
          conversas={conversas}
          onSelecionar={(conversa) => {
            onSelecionar(conversa);
            alterarAberto(false);
          }}
        />
      </div>
    </Modal>
  );
}

function ResultadoBusca({
  curta,
  carregando,
  conversas,
  onSelecionar,
}: Readonly<{
  curta: boolean;
  carregando: boolean;
  conversas: ConversaWhatsapp[];
  onSelecionar: (conversa: ConversaWhatsapp) => void;
}>) {
  if (curta) return <EmptyState icone={SearchIcon} titulo={BUSCA_CONVERSAS_MENSAGEM} />;
  if (carregando) {
    return (
      <p role="status" className="py-10 text-center text-sm text-muted-foreground">
        Carregando…
      </p>
    );
  }
  if (conversas.length === 0) {
    return <EmptyState icone={MessageSquareIcon} titulo="Nenhuma conversa encontrada" />;
  }
  return (
    <div role="list" aria-label="Resultados da busca" className="-mx-6 border-t">
      {conversas.map((conversa) => (
        <div role="listitem" key={conversa.id}>
          <ItemConversa conversa={conversa} onSelecionar={onSelecionar} />
        </div>
      ))}
    </div>
  );
}
