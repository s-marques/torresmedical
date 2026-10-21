import { validarArquivo, type ArquivoUso } from '@torres/shared';
import { Loader2Icon, UploadIcon, UserIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { mensagemDoErroDeUpload, uploadArquivo } from '@/lib/api/upload-arquivo';
import { cn } from '@/lib/utils';
import { useLinkArquivo } from './use-profissionais';

export interface SeletorImagemProps {
  uso: Extract<ArquivoUso, 'foto-profissional' | 'logo-receita'>;
  /** Arquivo já gravado no cadastro. */
  arquivoId: string | null;
  /** Sem cadastro salvo não há onde gravar o arquivo ("Salve primeiro"). */
  desabilitado: boolean;
  /** Texto do botão: "Alterar foto" ou "Enviar". */
  rotulo: string;
  /** Texto de apoio quando desabilitado. */
  dicaDesabilitado: string;
  redondo?: boolean;
  onEnviado: (arquivoId: string) => Promise<unknown>;
}

/** Foto do profissional e logo da receita: escolhe, valida, envia em `/api/arquivos` e grava no cadastro. */
export function SeletorImagem({
  uso,
  arquivoId,
  desabilitado,
  rotulo,
  dicaDesabilitado,
  redondo = false,
  onEnviado,
}: Readonly<SeletorImagemProps>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const link = useLinkArquivo(arquivoId);

  async function enviar(arquivo: File) {
    const invalido = validarArquivo(
      { nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size },
      uso,
    );
    if (invalido) {
      setErro(invalido);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const enviado = await uploadArquivo({ uso, arquivo });
      await onEnviado(enviado.id);
    } catch (error) {
      setErro(mensagemDoErroDeUpload(error));
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className={cn('grid gap-1', redondo && 'justify-items-center')}>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex shrink-0 items-center justify-center overflow-hidden border-2 border-dashed bg-muted/40 text-muted-foreground',
            redondo ? 'size-20 rounded-full' : 'size-12 rounded-md',
          )}
        >
          {link.data ? (
            <img src={link.data.url} alt="" className="size-full object-cover" />
          ) : redondo ? (
            <UserIcon aria-hidden className="size-8" />
          ) : (
            <UploadIcon aria-hidden className="size-4" />
          )}
        </div>
        {redondo ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={desabilitado || enviando}
            onClick={() => inputRef.current?.click()}
          >
            {enviando ? (
              <Loader2Icon aria-hidden className="animate-spin" />
            ) : (
              <UploadIcon aria-hidden />
            )}
            {rotulo}
          </Button>
        )}
      </div>
      {redondo && (
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          disabled={desabilitado || enviando}
          onClick={() => inputRef.current?.click()}
        >
          {desabilitado ? 'Salve primeiro' : rotulo}
        </button>
      )}
      {desabilitado && !redondo && (
        <p className="text-xs text-muted-foreground">{dicaDesabilitado}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        aria-label={rotulo}
        accept="image/jpeg,image/png,image/webp"
        disabled={desabilitado || enviando}
        onChange={(evento) => {
          const arquivo = evento.target.files?.[0];
          if (arquivo) void enviar(arquivo);
        }}
      />
      {erro && (
        <p className="text-xs text-destructive" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
