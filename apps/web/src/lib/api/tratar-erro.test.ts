import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, ERRO_CONEXAO, ERRO_INESPERADO_API } from './api-error';
import { errosPorCampo, MENSAGEM_SEM_PERMISSAO, tratarErroApi } from './tratar-erro';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

function erroApi(
  statusCode: number,
  extra: Partial<{ details: { field: string; message: string }[] }> = {},
) {
  return new ApiRequestError(statusCode, {
    statusCode,
    code: 'X',
    message: `Erro ${statusCode}`,
    requestId: 'req-1',
    ...extra,
  });
}

describe('tratarErroApi', () => {
  const onUnauthorized = vi.fn();

  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    onUnauthorized.mockClear();
  });

  it('401 redireciona para o login, sem toast', () => {
    tratarErroApi(erroApi(401), { onUnauthorized });

    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('403 mostra "Sem permissão"', () => {
    tratarErroApi(erroApi(403), { onUnauthorized });

    expect(toast.error).toHaveBeenCalledWith(MENSAGEM_SEM_PERMISSAO);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('400 com details fica para o formulário, sem toast', () => {
    tratarErroApi(erroApi(400, { details: [{ field: 'cpf', message: 'CPF inválido' }] }), {
      onUnauthorized,
    });

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('400 sem details aparece em toast', () => {
    tratarErroApi(erroApi(400), { onUnauthorized });

    expect(toast.error).toHaveBeenCalledWith('Erro 400');
  });

  it.each([404, 409, 500])('%i aparece em toast com a mensagem da API', (status) => {
    tratarErroApi(erroApi(status), { onUnauthorized });

    expect(toast.error).toHaveBeenCalledWith(`Erro ${status}`);
  });

  it('falha de conexão aparece em toast', () => {
    tratarErroApi(new ApiRequestError(0, null, ERRO_CONEXAO), { onUnauthorized });

    expect(toast.error).toHaveBeenCalledWith(ERRO_CONEXAO);
  });

  it('erro desconhecido aparece em toast com mensagem genérica', () => {
    tratarErroApi(new Error('detalhe interno'), { onUnauthorized });

    expect(toast.error).toHaveBeenCalledWith(ERRO_INESPERADO_API);
  });

  it('erro do formulário: só 401 e 403 são tratados aqui', () => {
    const contexto = { erroNoFormulario: true };
    for (const erro of [erroApi(409), erroApi(500), new Error('x')]) {
      tratarErroApi(erro, { onUnauthorized }, contexto);
    }
    expect(toast.error).not.toHaveBeenCalled();

    tratarErroApi(erroApi(403), { onUnauthorized }, contexto);
    tratarErroApi(erroApi(401), { onUnauthorized }, contexto);
    expect(toast.error).toHaveBeenCalledWith(MENSAGEM_SEM_PERMISSAO);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('ignora cancelamentos', () => {
    tratarErroApi(new DOMException('cancelado', 'AbortError'), { onUnauthorized });

    expect(toast.error).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('errosPorCampo', () => {
  it('mapeia os details do 400 por campo, ficando com a primeira mensagem de cada um', () => {
    const erro = erroApi(400, {
      details: [
        { field: 'cpf', message: 'CPF inválido' },
        { field: 'cpf', message: 'outra' },
        { field: 'nome', message: 'Obrigatório' },
      ],
    });

    expect(errosPorCampo(erro)).toEqual({ cpf: 'CPF inválido', nome: 'Obrigatório' });
  });

  it('devolve vazio para outros status ou erros', () => {
    expect(errosPorCampo(erroApi(409))).toEqual({});
    expect(errosPorCampo(erroApi(400))).toEqual({});
    expect(errosPorCampo(new Error('x'))).toEqual({});
  });
});
