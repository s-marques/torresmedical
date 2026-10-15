import { healthResponseSchema } from '@torres/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, ERRO_CONEXAO, ERRO_INESPERADO_API, erroDaResposta } from './api-error';
import { apiFetch, apiFetchArquivo, nomeDoArquivo } from './client';

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(...respostas: (Response | Error)[]) {
  const fn = vi.fn();
  for (const resposta of respostas) {
    if (resposta instanceof Error) fn.mockRejectedValueOnce(resposta);
    else fn.mockResolvedValueOnce(resposta);
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

const HEALTH = { status: 'ok', uptime: 1, timestamp: '2026-10-15T12:00:00.000Z' };
const ERRO_400 = {
  statusCode: 400,
  code: 'VALIDATION_ERROR',
  message: 'Dados inválidos',
  details: [{ field: 'cpf', message: 'CPF inválido' }],
  requestId: 'req-1',
};

describe('apiFetch', () => {
  it('faz GET com a query string e valida a resposta pelo schema', async () => {
    const fetchMock = mockFetch(json(HEALTH));

    const dados = await apiFetch('/api/health', {
      query: { page: 1, search: 'ana', ativo: true, status: undefined, vazio: null },
      schema: healthResponseSchema,
    });

    expect(dados).toEqual(HEALTH);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health?page=1&search=ana&ativo=true',
      expect.objectContaining({ method: 'GET', body: undefined }),
    );
  });

  it('não acrescenta "?" quando a query fica vazia', async () => {
    const fetchMock = mockFetch(json({}));

    await apiFetch('/api/x', { query: { a: undefined } });

    expect(fetchMock).toHaveBeenCalledWith('/api/x', expect.anything());
  });

  it('envia o corpo como JSON', async () => {
    const fetchMock = mockFetch(json({ id: '1' }, 201));

    const dados = await apiFetch('/api/x', { method: 'POST', body: { nome: 'Teste' } });

    expect(dados).toEqual({ id: '1' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/x',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ nome: 'Teste' }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('aceita 204 sem corpo', async () => {
    mockFetch(new Response(null, { status: 204 }));

    await expect(apiFetch('/api/x/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('rejeita com o corpo padrão de erro da API', async () => {
    mockFetch(json(ERRO_400, 400));

    const erro = await apiFetch('/api/x').catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApiRequestError);
    expect(erro).toMatchObject({ status: 400, message: 'Dados inválidos', body: ERRO_400 });
  });

  it('rejeita com mensagem genérica quando o erro foge do formato padrão', async () => {
    mockFetch(new Response('<html>Bad Gateway</html>', { status: 502 }));

    await expect(apiFetch('/api/x')).rejects.toMatchObject({
      status: 502,
      body: null,
      message: ERRO_INESPERADO_API,
    });
  });

  it('rejeita quando a resposta de sucesso foge do schema', async () => {
    mockFetch(json({ status: 'down' }));

    await expect(apiFetch('/api/health', { schema: healthResponseSchema })).rejects.toMatchObject({
      status: 200,
      message: ERRO_INESPERADO_API,
    });
  });

  it('rejeita com erro de conexão quando a rede falha', async () => {
    mockFetch(new TypeError('Failed to fetch'));

    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 0, message: ERRO_CONEXAO });
  });

  it('repassa o cancelamento', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('cancelado', 'AbortError')));

    await expect(apiFetch('/api/x', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('erroDaResposta', () => {
  it('usa a mensagem padrão informada quando o corpo não é o erro da API', () => {
    const erro = erroDaResposta(500, { qualquer: 1 }, 'Falhou');

    expect(erro).toMatchObject({ status: 500, body: null, message: 'Falhou' });
  });
});

describe('apiFetchArquivo', () => {
  it('baixa o arquivo com o nome do Content-Disposition', async () => {
    const fetchMock = mockFetch(
      new Response('conteudo', {
        headers: {
          'Content-Disposition': `attachment; filename="unidades.xlsx"; filename*=UTF-8''unidades%20%C3%BAteis.xlsx`,
        },
      }),
    );

    const arquivo = await apiFetchArquivo('/api/x/export', { query: { format: 'xlsx' } });

    expect(arquivo.nome).toBe('unidades úteis.xlsx');
    expect(await arquivo.blob.text()).toBe('conteudo');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/x/export?format=xlsx',
      expect.objectContaining({ headers: { Accept: '*/*' } }),
    );
  });

  it('usa o nome padrão sem Content-Disposition e rejeita com o erro da API', async () => {
    mockFetch(new Response('x'), json(ERRO_400, 400));

    expect((await apiFetchArquivo('/api/x', { nomePadrao: 'padrao.pdf' })).nome).toBe('padrao.pdf');
    await expect(apiFetchArquivo('/api/x')).rejects.toMatchObject({ status: 400 });
  });
});

describe('nomeDoArquivo', () => {
  it.each([
    [null, null],
    ['attachment; filename="a.pdf"', 'a.pdf'],
    [`attachment; filename=b.pdf; filename*=UTF-8''%E0%A4%A`, 'b.pdf'],
    ['attachment', null],
  ])('%s → %s', (disposition, nome) => {
    expect(nomeDoArquivo(disposition)).toBe(nome);
  });
});
