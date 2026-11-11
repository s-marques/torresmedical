import {
  CONVERSA_WHATSAPP_ROTULO_STATUS,
  type ConversaWhatsapp,
  type ConversaWhatsappStatus,
} from '@torres/shared';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { cn } from '@/lib/utils';
import { iniciais, quandoDaConversa, textoNaoLidas } from './formatar';

const TOM_STATUS: Readonly<Record<ConversaWhatsappStatus, TomStatus>> = {
  BOT: 'destaque',
  AGUARDANDO: 'alerta',
  EM_ATENDIMENTO: 'info',
  FINALIZADA: 'neutro',
};

export interface ItemConversaProps {
  conversa: ConversaWhatsapp;
  selecionada?: boolean;
  onSelecionar: (conversa: ConversaWhatsapp) => void;
}

/**
 * Item da lista de conversas: avatar com não lidas, contato, hora da última mensagem, canal,
 * prévia e status. Sem nome, mostra o telefone.
 */
export function ItemConversa({
  conversa,
  selecionada = false,
  onSelecionar,
}: Readonly<ItemConversaProps>) {
  const { contato, canal, status, naoLidas, ultimaMensagem } = conversa;
  const quando = conversa.ultimaMensagemEm ?? conversa.createdAt;
  return (
    <button
      type="button"
      aria-current={selecionada || undefined}
      onClick={() => onSelecionar(conversa)}
      className={cn(
        'flex w-full gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/60',
        selecionada && 'bg-muted',
      )}
    >
      <span className="relative shrink-0">
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        >
          {iniciais(contato.nome)}
        </span>
        {naoLidas > 0 && (
          <span
            aria-label={`${naoLidas} não lidas`}
            className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white"
          >
            {textoNaoLidas(naoLidas)}
          </span>
        )}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold">{contato.nome ?? contato.telefone}</span>
          <time dateTime={quando} className="shrink-0 text-xs text-muted-foreground">
            {quandoDaConversa(new Date(quando))}
          </time>
        </span>
        <span className="truncate text-xs text-blue-600 dark:text-blue-400">{canal.nome}</span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-muted-foreground">{ultimaMensagem ?? ''}</span>
          <StatusBadge tom={TOM_STATUS[status]} className="shrink-0 text-[10px]">
            {CONVERSA_WHATSAPP_ROTULO_STATUS[status]}
          </StatusBadge>
        </span>
      </span>
    </button>
  );
}
