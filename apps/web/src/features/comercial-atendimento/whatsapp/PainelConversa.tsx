import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { CabecalhoConversa } from './CabecalhoConversa';
import { ComposerMensagem } from './ComposerMensagem';
import { ListaMensagens } from './ListaMensagens';
import { ModalTransferir } from './ModalTransferir';
import { PainelContato } from './PainelContato';
import { useConversa, useEncerrarConversa, useMensagens } from './use-whatsapp';

/**
 * Painel da conversa aberta: cabeçalho, mensagens, rodapé e, à direita, o contato. O pai usa
 * `key={conversaId}` para o rascunho e a rolagem não vazarem de uma conversa para outra.
 */
export function PainelConversa({ conversaId }: Readonly<{ conversaId: string }>) {
  const conversa = useConversa(conversaId);
  const mensagens = useMensagens(conversaId);
  const encerrar = useEncerrarConversa(conversaId);
  const [detalhesAbertos, setDetalhesAbertos] = useState(true);
  const [transferindo, setTransferindo] = useState(false);
  const [encerrando, setEncerrando] = useState(false);

  if (conversa.isPending) {
    return (
      <p role="status" className="p-6 text-center text-sm text-muted-foreground">
        Carregando…
      </p>
    );
  }
  if (conversa.isError) {
    return (
      <p role="alert" className="p-6 text-center text-sm text-destructive">
        Não foi possível carregar a conversa.
      </p>
    );
  }

  const detalhe = conversa.data;
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <section aria-label="Conversa aberta" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CabecalhoConversa
          conversa={detalhe}
          onAlternarPainel={() => setDetalhesAbertos((aberto) => !aberto)}
          onTransferir={() => setTransferindo(true)}
          onEncerrar={() => setEncerrando(true)}
        />
        <ListaMensagens
          conversaId={conversaId}
          mensagens={mensagens.mensagens}
          carregando={mensagens.isPending}
          temAnteriores={mensagens.hasNextPage}
          carregandoAnteriores={mensagens.isFetchingNextPage}
          onCarregarAnteriores={() => void mensagens.fetchNextPage()}
        />
        <ComposerMensagem conversaId={conversaId} status={detalhe.status} />
      </section>
      {detalhesAbertos && <PainelContato conversa={detalhe} />}
      <ModalTransferir
        conversaId={conversaId}
        aberto={transferindo}
        onAbertoChange={setTransferindo}
      />
      <ConfirmDialog
        aberto={encerrando}
        onAbertoChange={setEncerrando}
        titulo="Encerrar conversa?"
        descricao="A conversa passa para Finalizada e deixa de aceitar mensagens."
        rotuloConfirmar="Encerrar"
        onConfirmar={() => encerrar.mutateAsync()}
      />
    </div>
  );
}
