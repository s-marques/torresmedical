import {
  CONVERSA_WHATSAPP_ROTULO_STATUS,
  formatarTelefoneWhatsapp,
  type ConversaWhatsappDetalhe,
} from '@torres/shared';
import {
  ArrowRightLeftIcon,
  CheckCheckIcon,
  ExternalLinkIcon,
  MegaphoneIcon,
  PanelRightIcon,
  PhoneIcon,
  UserCheckIcon,
} from 'lucide-react';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { AvatarContato } from './AvatarContato';
import { TOM_STATUS } from './filtros-status';
import { SeletorTags } from './SeletorTags';
import { useAssumirConversa } from './use-whatsapp';

/** O link do anúncio vem do provedor: só abre http(s). */
function linkSeguro(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export interface CabecalhoConversaProps {
  conversa: ConversaWhatsappDetalhe;
  onAlternarPainel: () => void;
  onTransferir: () => void;
  onEncerrar: () => void;
}

/**
 * Cabeçalho do painel: contato, canal, status e a origem do anúncio. Aguardando tem Assumir;
 * Em Atendimento, Transferir e Encerrar; Finalizada, só as tags.
 */
export function CabecalhoConversa({
  conversa,
  onAlternarPainel,
  onTransferir,
  onEncerrar,
}: Readonly<CabecalhoConversaProps>) {
  const { contato, canal, anuncio, status } = conversa;
  const assumir = useAssumirConversa(conversa.id);
  const link = linkSeguro(anuncio?.url ?? null);

  return (
    <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
      <AvatarContato nome={contato.nome} />
      <div className="grid min-w-0 gap-0.5">
        <h2 className="truncate text-sm font-semibold">
          {contato.nome ?? formatarTelefoneWhatsapp(contato.telefone)}
        </h2>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <PhoneIcon aria-hidden className="size-3" />
          {formatarTelefoneWhatsapp(contato.telefone)}
        </p>
        <p className="text-xs text-blue-600 dark:text-blue-400">{canal.nome}</p>
      </div>
      <StatusBadge tom={TOM_STATUS[status]}>{CONVERSA_WHATSAPP_ROTULO_STATUS[status]}</StatusBadge>
      {anuncio && (
        <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="flex shrink-0 items-center gap-1 rounded-md border border-fuchsia-300 px-2 py-0.5 text-fuchsia-700 dark:text-fuchsia-300">
            <MegaphoneIcon aria-hidden className="size-3" />
            Veio de anúncio · {anuncio.origem}
          </span>
          {anuncio.titulo && <span className="truncate">{anuncio.titulo}</span>}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir o anúncio"
              className="shrink-0"
            >
              <ExternalLinkIcon aria-hidden className="size-3" />
            </a>
          )}
        </p>
      )}
      <div className="ml-auto flex items-center gap-2">
        <SePermitido permissao="comercial-atendimento.whatsapp.editar">
          {status === 'AGUARDANDO' && (
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={assumir.isPending}
              onClick={() => assumir.mutate()}
            >
              <UserCheckIcon aria-hidden />
              Assumir
            </Button>
          )}
          {status === 'EM_ATENDIMENTO' && (
            <>
              <Button type="button" variant="outline" onClick={onTransferir}>
                <ArrowRightLeftIcon aria-hidden />
                Transferir
              </Button>
              <Button type="button" variant="destructive" onClick={onEncerrar}>
                <CheckCheckIcon aria-hidden />
                Encerrar
              </Button>
            </>
          )}
          <SeletorTags conversa={conversa} />
        </SePermitido>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Mostrar ou ocultar os detalhes"
          onClick={onAlternarPainel}
        >
          <PanelRightIcon aria-hidden />
        </Button>
      </div>
    </header>
  );
}
