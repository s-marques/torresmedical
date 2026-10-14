import type { Arquivo } from '@torres/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiRequestError,
  uploadArquivo,
  type UploadArquivoOptions,
} from '../../lib/api/upload-arquivo';
import { FileUpload } from './FileUpload';

vi.mock('../../lib/api/upload-arquivo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api/upload-arquivo')>()),
  uploadArquivo: vi.fn(),
}));

const uploadMock = vi.mocked(uploadArquivo);
const MB = 1024 * 1024;

const ARQUIVO: Arquivo = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  uso: 'avatar',
  nomeOriginal: 'foto.png',
  contentType: 'image/png',
  tamanho: 3,
  criadoPor: null,
  createdAt: '2026-10-14T12:00:00.000Z',
};

function png(nome = 'foto.png', tamanho = 3) {
  const file = new File(['abc'], nome, { type: 'image/png' });
  Object.defineProperty(file, 'size', { value: tamanho });
  return file;
}

/** Upload controlado pelo teste: progresso e resolução manuais. */
function uploadPendente() {
  let opcoes!: UploadArquivoOptions;
  let resolver!: (arquivo: Arquivo) => void;
  let rejeitar!: (erro: unknown) => void;
  uploadMock.mockImplementation((o) => {
    opcoes = o;
    return new Promise<Arquivo>((res, rej) => {
      resolver = res;
      rejeitar = rej;
    });
  });
  return {
    opcoes: () => opcoes,
    resolver: (a: Arquivo) => act(async () => resolver(a)),
    rejeitar: (e: unknown) => act(async () => rejeitar(e)),
  };
}

function renderizar(props: { disabled?: boolean } = {}) {
  const onUploaded = vi.fn();
  render(<FileUpload uso="avatar" label="Enviar avatar" onUploaded={onUploaded} {...props} />);
  return { onUploaded, input: screen.getByLabelText(/Enviar avatar/) as HTMLInputElement };
}

beforeEach(() => {
  uploadMock.mockReset();
});

describe('FileUpload', () => {
  it('mostra formatos e tamanho do uso e restringe o seletor', () => {
    const { input } = renderizar();

    expect(screen.getByText('JPG, PNG ou GIF. Máximo 2 MB.')).toBeInTheDocument();
    expect(input).toHaveAttribute('accept', '.jpg,.jpeg,.png,.gif');
    expect(input).toHaveAccessibleDescription('JPG, PNG ou GIF. Máximo 2 MB.');
  });

  it('envia o arquivo escolhido, mostra o progresso e devolve os metadados', async () => {
    const pendente = uploadPendente();
    const { input, onUploaded } = renderizar();

    await userEvent.upload(input, png());

    expect(pendente.opcoes()).toMatchObject({ uso: 'avatar', arquivo: expect.any(File) });
    expect(input).toBeDisabled();
    act(() => pendente.opcoes().onProgress?.(40));
    expect(screen.getByRole('progressbar', { name: 'Enviando foto.png' })).toHaveAttribute(
      'value',
      '40',
    );

    await pendente.resolver(ARQUIVO);

    expect(onUploaded).toHaveBeenCalledWith(ARQUIVO);
    expect(screen.getByRole('status')).toHaveTextContent('Arquivo enviado: foto.png');
    expect(input).toBeEnabled();
  });

  it('aceita arquivo arrastado e solto', async () => {
    uploadMock.mockResolvedValue(ARQUIVO);
    const { onUploaded } = renderizar();
    const zona = screen.getByTestId('file-upload-zona');

    fireEvent.dragOver(zona);
    expect(zona.parentElement).toHaveClass('file-upload--arrastando');
    fireEvent.dragLeave(zona);
    expect(zona.parentElement).not.toHaveClass('file-upload--arrastando');
    fireEvent.dragOver(zona);
    await act(async () => {
      fireEvent.drop(zona, { dataTransfer: { files: [png()] } });
    });

    expect(zona.parentElement).not.toHaveClass('file-upload--arrastando');
    expect(onUploaded).toHaveBeenCalledWith(ARQUIVO);
  });

  it('valida tipo e tamanho antes de enviar', async () => {
    const { input } = renderizar();

    const usuario = userEvent.setup({ applyAccept: false });
    await usuario.upload(input, new File(['x'], 'doc.pdf', { type: 'application/pdf' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Tipo de arquivo não permitido. Envie JPG, PNG ou GIF',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await usuario.upload(input, png('grande.png', 3 * MB));
    expect(screen.getByRole('alert')).toHaveTextContent('O arquivo deve ter no máximo 2 MB');
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('mostra o erro devolvido pela API', async () => {
    const pendente = uploadPendente();
    const { input, onUploaded } = renderizar();

    await userEvent.upload(input, png());
    await pendente.rejeitar(
      new ApiRequestError(400, {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: [
          { field: 'arquivo', message: 'O conteúdo do arquivo não corresponde ao tipo informado' },
        ],
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'O conteúdo do arquivo não corresponde ao tipo informado',
    );
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('cancela o envio em andamento', async () => {
    const pendente = uploadPendente();
    const { input } = renderizar();

    await userEvent.upload(input, png());
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(pendente.opcoes().signal?.aborted).toBe(true);
    await pendente.rejeitar(new DOMException('Envio cancelado', 'AbortError'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('desabilitado não aceita arquivo arrastado', () => {
    const { input } = renderizar({ disabled: true });

    fireEvent.drop(screen.getByTestId('file-upload-zona'), { dataTransfer: { files: [png()] } });

    expect(input).toBeDisabled();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('rótulo padrão; seleção vazia não envia', () => {
    render(<FileUpload uso="nfe-xml" onUploaded={vi.fn()} />);
    const input = screen.getByLabelText(/Enviar arquivo/);

    fireEvent.change(input, { target: { files: [] } });

    expect(screen.getByText('XML. Máximo 5 MB.')).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
