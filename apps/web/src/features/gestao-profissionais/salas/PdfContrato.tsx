import { validarArquivo, type ContratoSala } from '@torres/shared';
import { DownloadIcon, Loader2Icon, UploadIcon, XCircleIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { mensagemDoErroDeUpload, uploadArquivo } from '@/lib/api/upload-arquivo';
import { linkDoPdf, useDefinirPdfContrato } from './use-contratos-sala';

/**
 * Coluna PDF da tabela: sem PDF, o ícone de enviar ("Enviar PDF"); com PDF, o de baixar e o de
 * "Remover PDF" (que pede confirmação).
 */
export function PdfContrato({ contrato }: Readonly<{ contrato: ContratoSala }>) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const definir = useDefinirPdfContrato();
  const rotulo = `contrato de ${contrato.locatarioNome}`;

  async function enviar(arquivo: File) {
    const invalido = validarArquivo(
      { nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size },
      'contrato-sala',
    );
    if (invalido) {
      toast.error(invalido);
      return;
    }
    setEnviando(true);
    try {
      const enviado = await uploadArquivo({ uso: 'contrato-sala', arquivo });
      await definir.mutateAsync({ id: contrato.id, arquivoId: enviado.id });
      toast.success('PDF anexado.');
    } catch (erro) {
      toast.error(mensagemDoErroDeUpload(erro));
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = '';
    }
  }

  async function abrir(arquivoId: string) {
    try {
      const link = await linkDoPdf(arquivoId);
      window.open(link.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Não foi possível abrir o PDF.');
    }
  }

  return (
    <div className="flex items-center justify-center gap-1">
      {contrato.pdfArquivoId ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-blue-600 hover:text-blue-600"
            aria-label={`Baixar PDF do ${rotulo}`}
            title="Baixar PDF"
            onClick={() => void abrir(contrato.pdfArquivoId ?? '')}
          >
            <DownloadIcon aria-hidden />
          </Button>
          <SePermitido permissao="gestao-profissionais.salas.editar">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remover PDF do ${rotulo}`}
              title="Remover PDF"
              onClick={() => setRemovendo(true)}
            >
              <XCircleIcon aria-hidden />
            </Button>
          </SePermitido>
        </>
      ) : (
        <SePermitido permissao="gestao-profissionais.salas.editar">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Enviar PDF do ${rotulo}`}
            title="Enviar PDF"
            disabled={enviando}
            onClick={() => entrada.current?.click()}
          >
            {enviando ? (
              <Loader2Icon aria-hidden className="animate-spin" />
            ) : (
              <UploadIcon aria-hidden />
            )}
          </Button>
          <input
            ref={entrada}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            tabIndex={-1}
            aria-label={`Arquivo PDF do ${rotulo}`}
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo) void enviar(arquivo);
            }}
          />
        </SePermitido>
      )}
      <ConfirmDialog
        aberto={removendo}
        onAbertoChange={setRemovendo}
        titulo="Remover PDF?"
        descricao={`O PDF do ${rotulo} será removido do contrato. Você pode enviar outro depois.`}
        rotuloConfirmar="Remover"
        onConfirmar={async () => {
          await definir.mutateAsync({ id: contrato.id, arquivoId: null });
          toast.success('PDF removido.');
        }}
      />
    </div>
  );
}
