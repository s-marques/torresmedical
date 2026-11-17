import {
  MENSAGEM_WHATSAPP_ROTULO_TIPO,
  type MensagemWhatsapp,
  type MensagemWhatsappAutor,
  type MensagemWhatsappStatus,
  type MensagemWhatsappTipo,
} from '@torres/shared';
import {
  CheckCheckIcon,
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  ImageIcon,
  MicIcon,
  UserIcon,
  VideoIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatarDuracao, horaDaMensagem, legendaDoAutor } from './formatar';

const ESTILO_BALAO: Readonly<Record<MensagemWhatsappAutor, string>> = {
  CLIENTE: 'bg-muted',
  ATENDENTE: 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950',
  ASSISTENTE_VIRTUAL: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950',
  CELULAR: 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950',
  CAMPANHA: 'border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950',
};

const ESTILO_LEGENDA: Readonly<Record<MensagemWhatsappAutor, string>> = {
  CLIENTE: 'text-muted-foreground',
  ATENDENTE: 'text-emerald-700 dark:text-emerald-300',
  ASSISTENTE_VIRTUAL: 'text-blue-700 dark:text-blue-300',
  CELULAR: 'text-orange-700 dark:text-orange-300',
  CAMPANHA: 'text-violet-700 dark:text-violet-300',
};

const ICONE_TIPO: Readonly<Record<Exclude<MensagemWhatsappTipo, 'TEXTO'>, LucideIcon>> = {
  AUDIO: MicIcon,
  IMAGEM: ImageIcon,
  DOCUMENTO: FileTextIcon,
  VIDEO: VideoIcon,
};

const ROTULO_STATUS: Readonly<Record<MensagemWhatsappStatus, string>> = {
  PENDENTE: 'Pendente',
  ENVIADA: 'Enviada',
  ENTREGUE: 'Entregue',
  LIDA: 'Lida',
  FALHA: 'Não enviada',
};

/** ✓ enviada, ✓✓ entregue, ✓✓ azul lida, relógio pendente e "Não enviada" em vermelho. */
function MarcaStatus({ status }: Readonly<{ status: MensagemWhatsappStatus }>) {
  if (status === 'FALHA') {
    return (
      <span className="flex items-center gap-0.5 text-destructive">
        <XIcon aria-hidden className="size-3" />
        {ROTULO_STATUS.FALHA}
      </span>
    );
  }
  const Icone = {
    PENDENTE: ClockIcon,
    ENVIADA: CheckIcon,
    ENTREGUE: CheckCheckIcon,
    LIDA: CheckCheckIcon,
  }[status];
  return (
    <span
      role="img"
      aria-label={ROTULO_STATUS[status]}
      className={cn(status === 'LIDA' && 'text-blue-500')}
    >
      <Icone aria-hidden className="size-3.5" />
    </span>
  );
}

function MidiaDaMensagem({
  tipo,
  duracaoSegundos,
}: Readonly<{ tipo: Exclude<MensagemWhatsappTipo, 'TEXTO'>; duracaoSegundos: number | null }>) {
  const Icone = ICONE_TIPO[tipo];
  return (
    <p className="flex items-center gap-2 rounded-md bg-background/60 px-3 py-2 text-sm">
      <Icone aria-hidden className="size-4 shrink-0" />
      <span>
        {MENSAGEM_WHATSAPP_ROTULO_TIPO[tipo]}
        {duracaoSegundos !== null && ` · ${formatarDuracao(duracaoSegundos)}`}
      </span>
      <span className="text-xs text-muted-foreground">Disponível com a integração</span>
    </p>
  );
}

/**
 * Balão da conversa: cliente à esquerda (cinza); atendente (verde), assistente virtual (azul)
 * e celular da clínica (laranja) à direita, com a legenda de quem enviou e o status de entrega.
 */
export function MensagemBalao({ mensagem }: Readonly<{ mensagem: MensagemWhatsapp }>) {
  const { autor, autorNome, citacao, status, tipo, conteudo } = mensagem;
  const recebida = autor === 'CLIENTE';
  return (
    <article
      aria-label={`Mensagem de ${legendaDoAutor(autor, autorNome)}`}
      className={cn('flex flex-col gap-0.5', recebida ? 'items-start' : 'items-end')}
    >
      {!recebida && (
        <span className={cn('flex items-center gap-1 text-[11px]', ESTILO_LEGENDA[autor])}>
          {autor === 'ATENDENTE' && <UserIcon aria-hidden className="size-3" />}
          {legendaDoAutor(autor, autorNome)}
        </span>
      )}
      <div
        className={cn(
          'grid max-w-[80%] gap-2 rounded-2xl border border-transparent px-4 py-2 text-sm',
          ESTILO_BALAO[autor],
        )}
      >
        {citacao && (
          <blockquote className="rounded-md border-l-4 border-blue-400 bg-background/60 px-3 py-1.5 text-xs">
            <p className="font-medium text-blue-600 dark:text-blue-400">
              {legendaDoAutor(citacao.autor, citacao.autorNome)}
            </p>
            <p className="text-muted-foreground">{citacao.conteudo}</p>
          </blockquote>
        )}
        {tipo !== 'TEXTO' && (
          <MidiaDaMensagem tipo={tipo} duracaoSegundos={mensagem.duracaoSegundos} />
        )}
        {conteudo && <p className="whitespace-pre-wrap">{conteudo}</p>}
      </div>
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <time dateTime={mensagem.enviadaEm}>{horaDaMensagem(new Date(mensagem.enviadaEm))}</time>
        {!recebida && <MarcaStatus status={status} />}
      </span>
    </article>
  );
}
