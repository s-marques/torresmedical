import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, ERRO_401, json, sessaoJson } from '../../test/render-app';
import { apiFetch, authorizationHeader } from '../api/client';
import { destinoAposLogin } from './redirect';
import {
  encerrarSessaoLocal,
  entrar,
  iniciarSessao,
  obterSessao,
  renovarSessao,
  sair,
} from './sessao';

describe('sessão', () => {
  it('entra e passa a enviar o access token', async () => {
    const fetchMock = apiFalsa({ rotas: { '/api/auth/login': () => sessaoJson() } });
    vi.stubGlobal('fetch', fetchMock);

    await entrar({ email: 'pessoa@example.com', senha: 'x' });
    await apiFetch('/api/qualquer').catch(() => undefined);

    expect(obterSessao()).toMatchObject({ status: 'autenticado' });
    expect(authorizationHeader()).toBe('Bearer token-1');
    const [chamada] = chamadasPara(fetchMock, '/api/qualquer');
    expect(new Headers(chamada?.[1]?.headers).get('Authorization')).toBe('Bearer token-1');
    const [login] = chamadasPara(fetchMock, '/api/auth/login');
    expect(new Headers(login?.[1]?.headers).get('Authorization')).toBeNull();
  });

  it('renovações simultâneas fazem uma chamada só', async () => {
    const fetchMock = apiFalsa();
    vi.stubGlobal('fetch', fetchMock);

    const resultados = await Promise.all([renovarSessao(), renovarSessao()]);

    expect(resultados).toEqual([true, true]);
    expect(chamadasPara(fetchMock, '/api/auth/refresh')).toHaveLength(1);
  });

  it('usa o Web Locks API, quando existe, para renovar uma aba por vez', async () => {
    vi.stubGlobal('fetch', apiFalsa());
    const request = vi.fn((_nome: string, tarefa: () => Promise<unknown>) => tarefa());
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });

    expect(await renovarSessao()).toBe(true);
    expect(request).toHaveBeenCalledWith('torres-renovar-sessao', expect.any(Function));
  });

  it('sem sessão no servidor fica anônima', async () => {
    vi.stubGlobal('fetch', apiFalsa({ usuario: null }));

    iniciarSessao();
    iniciarSessao();

    await vi.waitFor(() => expect(obterSessao()).toEqual({ status: 'anonimo' }));
    expect(authorizationHeader()).toBeNull();
  });

  it('não repete a chamada quando a renovação falha', async () => {
    const fetchMock = apiFalsa({
      usuario: null,
      rotas: { '/api/x': () => json(ERRO_401, 401) },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 401 });
    expect(chamadasPara(fetchMock, '/api/x')).toHaveLength(1);
  });

  it('sai mesmo se o logout falhar na rede', async () => {
    vi.stubGlobal('fetch', apiFalsa({ rotas: { '/api/auth/login': () => sessaoJson() } }));
    await entrar({ email: 'pessoa@example.com', senha: 'x' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sem rede')));

    await sair();

    expect(obterSessao()).toEqual({ status: 'anonimo' });
  });

  it('encerra a sessão local', async () => {
    vi.stubGlobal('fetch', apiFalsa({ rotas: { '/api/auth/login': () => sessaoJson() } }));
    await entrar({ email: 'pessoa@example.com', senha: 'x' });

    encerrarSessaoLocal();

    expect(obterSessao()).toEqual({ status: 'anonimo' });
  });
});

describe('destinoAposLogin', () => {
  it.each([
    ['/clientes', '/clientes'],
    ['/receber?status=pago', '/receber?status=pago'],
    [null, '/'],
    ['https://outro-site.com', '/'],
    ['//outro-site.com', '/'],
    ['/\\outro-site.com', '/'],
    ['/login', '/'],
    ['/redefinir-senha?token=x', '/'],
  ])('%s → %s', (redirect, esperado) => {
    expect(destinoAposLogin(redirect)).toBe(esperado);
  });
});
