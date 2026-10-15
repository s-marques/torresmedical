import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './api-error';
import { META_FORMULARIO, createQueryClient, deveRepetir } from './query-client';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const erro = (status: number) => new ApiRequestError(status, null, `Erro ${status}`);

describe('deveRepetir', () => {
  it('não repete erros 4xx', () => {
    expect(deveRepetir(0, erro(400))).toBe(false);
    expect(deveRepetir(0, erro(401))).toBe(false);
    expect(deveRepetir(0, erro(404))).toBe(false);
  });

  it('repete falhas de rede e 5xx até o limite', () => {
    expect(deveRepetir(0, erro(0))).toBe(true);
    expect(deveRepetir(1, erro(503))).toBe(true);
    expect(deveRepetir(2, erro(503))).toBe(false);
  });
});

describe('createQueryClient', () => {
  const onUnauthorized = vi.fn();

  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    onUnauthorized.mockClear();
  });

  it('trata o erro das queries de forma centralizada', async () => {
    const client = createQueryClient({ onUnauthorized });

    await client
      .fetchQuery({ queryKey: ['x'], queryFn: () => Promise.reject(erro(401)) })
      .catch(() => {});

    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('não trata o erro da query com meta.tratarErro = false', async () => {
    const client = createQueryClient({ onUnauthorized });

    await client
      .fetchQuery({
        queryKey: ['y'],
        queryFn: () => Promise.reject(erro(500)),
        retry: false,
        meta: { tratarErro: false },
      })
      .catch(() => {});

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('trata o erro das mutations de forma centralizada', async () => {
    const client = createQueryClient({ onUnauthorized });
    const mutation = client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(erro(403)) });

    await mutation.execute(undefined).catch(() => {});

    expect(toast.error).toHaveBeenCalledWith('Sem permissão');
  });

  it('não trata o erro da mutation com meta.tratarErro = false', async () => {
    const client = createQueryClient({ onUnauthorized });
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(erro(500)),
      meta: { tratarErro: false },
    });

    await mutation.execute(undefined).catch(() => {});

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('mutation de formulário não mostra toast para os erros que o formulário exibe', async () => {
    const client = createQueryClient({ onUnauthorized });
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(erro(409)),
      meta: META_FORMULARIO,
    });

    await mutation.execute(undefined).catch(() => {});

    expect(toast.error).not.toHaveBeenCalled();
  });
});
