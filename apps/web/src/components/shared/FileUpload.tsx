import {
  acceptDoUso,
  ARQUIVO_USOS,
  descreverFormatos,
  formatarTamanho,
  validarArquivo,
  type Arquivo,
  type ArquivoUso,
} from '@torres/shared';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { mensagemDoErroDeUpload, uploadArquivo } from '../../lib/api/upload-arquivo';

export interface FileUploadProps {
  /** Uso do arquivo: define formatos aceitos e tamanho máximo (catálogo de `packages/shared`). */
  uso: ArquivoUso;
  /** Rótulo do campo. Padrão: "Enviar arquivo". */
  label?: string;
  disabled?: boolean;
  /** Chamado com os metadados do arquivo depois do envio (use o `id` no formulário). */
  onUploaded: (arquivo: Arquivo) => void;
}

type Estado =
  | { tipo: 'ocioso' }
  | { tipo: 'enviando'; nome: string; progresso: number }
  | { tipo: 'enviado'; nome: string }
  | { tipo: 'erro'; mensagem: string };

/**
 * Campo de upload com arrastar e soltar, clique (ou teclado) para escolher, validação de
 * tipo/tamanho antes de enviar, barra de progresso, cancelamento e mensagem de erro.
 */
export function FileUpload({ uso, label: labelInformado, disabled, onUploaded }: FileUploadProps) {
  const id = useId();
  const { t } = useTranslation();
  const label = labelInformado ?? t('upload.enviarArquivo');
  const [estado, setEstado] = useState<Estado>({ tipo: 'ocioso' });
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const envioRef = useRef<AbortController | null>(null);

  useEffect(() => () => envioRef.current?.abort(), []);

  const enviando = estado.tipo === 'enviando';
  const bloqueado = disabled || enviando;
  const dica = t('upload.dica', {
    formatos: descreverFormatos(uso),
    tamanho: formatarTamanho(ARQUIVO_USOS[uso].maxBytes),
  });

  async function enviar(arquivo: File) {
    const erro = validarArquivo(
      { nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size },
      uso,
    );
    if (erro) {
      setEstado({ tipo: 'erro', mensagem: erro });
      return;
    }

    const controller = new AbortController();
    envioRef.current = controller;
    setEstado({ tipo: 'enviando', nome: arquivo.name, progresso: 0 });
    try {
      const enviado = await uploadArquivo({
        uso,
        arquivo,
        signal: controller.signal,
        onProgress: (progresso) => setEstado({ tipo: 'enviando', nome: arquivo.name, progresso }),
      });
      setEstado({ tipo: 'enviado', nome: enviado.nomeOriginal });
      onUploaded(enviado);
    } catch (error) {
      if (controller.signal.aborted) setEstado({ tipo: 'ocioso' });
      else setEstado({ tipo: 'erro', mensagem: mensagemDoErroDeUpload(error) });
    } finally {
      envioRef.current = null;
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function selecionar(arquivos: FileList | null) {
    const arquivo = arquivos?.[0];
    if (arquivo) void enviar(arquivo);
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
    if (!bloqueado) setArrastando(true);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setArrastando(false);
    if (!bloqueado) selecionar(event.dataTransfer.files);
  }

  return (
    <div
      className="group/upload grid gap-2"
      data-arrastando={arrastando || undefined}
      data-bloqueado={bloqueado || undefined}
    >
      <label
        htmlFor={id}
        className={cn(
          'grid cursor-pointer gap-1 rounded-lg border-2 border-dashed border-input p-5 text-center transition-colors',
          'group-focus-within/upload:border-primary group-focus-within/upload:bg-primary/5',
          'group-data-arrastando/upload:border-primary group-data-arrastando/upload:bg-primary/5',
          'group-data-bloqueado/upload:cursor-not-allowed group-data-bloqueado/upload:opacity-60',
        )}
        data-testid="file-upload-zona"
        onDragOver={onDragOver}
        onDragLeave={() => setArrastando(false)}
        onDrop={onDrop}
      >
        <span className="font-semibold">{label}</span>
        <span>{t('upload.arraste')}</span>
        <span className="text-sm text-muted-foreground" id={`${id}-dica`}>
          {dica}
        </span>
      </label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="sr-only"
        accept={acceptDoUso(uso)}
        disabled={bloqueado}
        aria-describedby={`${id}-dica`}
        aria-invalid={estado.tipo === 'erro'}
        onChange={(event) => selecionar(event.target.files)}
      />

      {estado.tipo === 'enviando' && (
        <div className="flex items-center gap-2">
          <span>{t('upload.enviando', { nome: estado.nome })}</span>
          <progress
            max={100}
            value={estado.progresso}
            aria-label={t('upload.enviandoRotulo', { nome: estado.nome })}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => envioRef.current?.abort()}
          >
            {t('comum.cancelar')}
          </Button>
        </div>
      )}
      {estado.tipo === 'enviado' && (
        <p className="m-0 flex items-center gap-2" role="status">
          {t('upload.enviado', { nome: estado.nome })}
        </p>
      )}
      {estado.tipo === 'erro' && (
        <p className="m-0 text-destructive" role="alert">
          {estado.mensagem}
        </p>
      )}
    </div>
  );
}
