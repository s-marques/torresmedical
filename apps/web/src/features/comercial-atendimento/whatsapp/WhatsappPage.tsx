import { MegaphoneIcon, MessageSquareIcon, SearchIcon, TagIcon } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { ChipsCanal } from './ChipsCanal';
import { FormNovaConversa } from './FormNovaConversa';
import type { FiltroStatusConversa } from './filtros-status';
import { ChipsStatusConversa, ListaConversas } from './ListaConversas';
import { ModalAnuncios } from './ModalAnuncios';
import { ModalBuscarConversas } from './ModalBuscarConversas';
import { ModalGerenciarTags } from './ModalGerenciarTags';
import { PainelConversa } from './PainelConversa';
import { useCanaisWhatsapp, useContadores } from './use-whatsapp';

type ModalAberto = 'anuncios' | 'tags' | 'busca' | null;

/**
 * Tela WhatsApp (`/atendimento`): conversas por canal e status, Nova conversa, busca, tags e
 * anúncios. Ao escolher uma conversa, o painel dela abre à direita (`PainelConversa`).
 */
export default function WhatsappPage() {
  const [canalId, setCanalId] = useState<string | undefined>();
  const [status, setStatus] = useState<FiltroStatusConversa>('aguardando');
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [modal, setModal] = useState<ModalAberto>(null);
  const canais = useCanaisWhatsapp().data?.data ?? [];
  const contadores = useContadores(canalId);

  function alterarModal(alvo: Exclude<ModalAberto, null>) {
    return (aberto: boolean) => setModal(aberto ? alvo : null);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo="Atendimento"
        descricao="Gerencie conversas do WhatsApp em tempo real."
        acoes={
          <>
            <Button variant="outline" onClick={() => setModal('anuncios')}>
              <MegaphoneIcon aria-hidden />
              Anúncios
            </Button>
            <Button variant="outline" onClick={() => setModal('tags')}>
              <TagIcon aria-hidden />
              Gerenciar Tags
            </Button>
          </>
        }
      />
      <ChipsCanal canais={canais} canalId={canalId} onChange={setCanalId} />

      <div className="grid min-h-[32rem] overflow-hidden rounded-xl border md:h-[42rem] md:grid-cols-[22rem_1fr]">
        <aside
          aria-label="Conversas"
          className="flex min-h-0 flex-col border-b md:border-r md:border-b-0"
        >
          <div className="flex gap-2 p-4">
            <Button
              variant="outline"
              className="flex-1 justify-start font-normal text-muted-foreground"
              onClick={() => setModal('busca')}
            >
              <SearchIcon aria-hidden />
              Buscar conversas...
            </Button>
            <SePermitido permissao="comercial-atendimento.whatsapp.criar">
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                aria-expanded={novaAberta}
                onClick={() => setNovaAberta(true)}
              >
                <MessageSquareIcon aria-hidden />
                Nova
              </Button>
            </SePermitido>
          </div>
          {novaAberta && <FormNovaConversa canais={canais} onFechar={() => setNovaAberta(false)} />}
          <ChipsStatusConversa valor={status} contadores={contadores.data} onChange={setStatus} />
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t">
            <ListaConversas
              canalId={canalId}
              status={status}
              selecionadaId={selecionadaId}
              onSelecionar={(conversa) => setSelecionadaId(conversa.id)}
            />
          </div>
        </aside>
        {selecionadaId ? (
          <PainelConversa key={selecionadaId} conversaId={selecionadaId} />
        ) : (
          <section aria-label="Conversa" className="flex items-center justify-center p-6">
            <EmptyState
              icone={MessageSquareIcon}
              titulo="Selecione uma conversa"
              descricao="Escolha uma conversa na lista ao lado para começar."
            />
          </section>
        )}
      </div>

      <ModalAnuncios aberto={modal === 'anuncios'} onAbertoChange={alterarModal('anuncios')} />
      <ModalGerenciarTags aberto={modal === 'tags'} onAbertoChange={alterarModal('tags')} />
      <ModalBuscarConversas
        aberto={modal === 'busca'}
        onAbertoChange={alterarModal('busca')}
        onSelecionar={(conversa) => setSelecionadaId(conversa.id)}
      />
    </div>
  );
}
