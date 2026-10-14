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
import { mensagemDoErroDeUpload, uploadArquivo } from '../../lib/api/upload-arquivo';
import './file-upload.css';

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
export function FileUpload({
  uso,
  label = 'Enviar arquivo',
  disabled,
  onUploaded,
}: FileUploadProps) {
  const id = useId();
  const [estado, setEstado] = useState<Estado>({ tipo: 'ocioso' });
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const envioRef = useRef<AbortController | null>(null);

  useEffect(() => () => envioRef.current?.abort(), []);

  const enviando = estado.tipo === 'enviando';
  const bloqueado = disabled || enviando;
  const dica = `${descreverFormatos(uso)}. Máximo ${formatarTamanho(ARQUIVO_USOS[uso].maxBytes)}.`;

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

  const classes = [
    'file-upload',
    arrastando && 'file-upload--arrastando',
    bloqueado && 'file-upload--bloqueado',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <label
        htmlFor={id}
        className="file-upload__zona"
        data-testid="file-upload-zona"
        onDragOver={onDragOver}
        onDragLeave={() => setArrastando(false)}
        onDrop={onDrop}
      >
        <span className="file-upload__rotulo">{label}</span>
        <span className="file-upload__instrucao">
          Arraste o arquivo aqui ou clique para escolher
        </span>
        <span className="file-upload__dica" id={`${id}-dica`}>
          {dica}
        </span>
      </label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="file-upload__input"
        accept={acceptDoUso(uso)}
        disabled={bloqueado}
        aria-describedby={`${id}-dica`}
        aria-invalid={estado.tipo === 'erro'}
        onChange={(event) => selecionar(event.target.files)}
      />

      {estado.tipo === 'enviando' && (
        <div className="file-upload__status">
          <span>Enviando {estado.nome}…</span>
          <progress max={100} value={estado.progresso} aria-label={`Enviando ${estado.nome}`} />
          <button type="button" onClick={() => envioRef.current?.abort()}>
            Cancelar
          </button>
        </div>
      )}
      {estado.tipo === 'enviado' && (
        <p className="file-upload__status" role="status">
          Arquivo enviado: {estado.nome}
        </p>
      )}
      {estado.tipo === 'erro' && (
        <p className="file-upload__erro" role="alert">
          {estado.mensagem}
        </p>
      )}
    </div>
  );
}
