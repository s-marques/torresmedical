import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PREFERENCIAS_PADRAO } from '@torres/shared';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '../../../test/render-app';

const PROVISORIA = { ...USUARIO_TESTE, trocarSenha: true };
const REGRAS = { tamanhoMinimo: 12, exigirMaiuscula: true, exigirSimbolo: false };

function corpo(init?: RequestInit): unknown {
  return JSON.parse(String(init?.body));
}

function api(extra: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    usuario: PROVISORIA,
    ...extra,
    rotas: {
      '/api/auth/regras-senha': () => json(REGRAS),
      ...extra.rotas,
    },
  });
}

describe('troca de senha obrigatória (issue #156)', () => {
  it('senha provisória leva qualquer tela para a troca, guardando a tela pedida', async () => {
    const { router } = renderApp('/clientes', api());

    expect(await screen.findByLabelText('Senha atual')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/trocar-senha');
    expect(router.state.location.search).toBe('?redirect=%2Fclientes');
  });

  it('mostra as regras da política configurada', async () => {
    renderApp('/trocar-senha', api());

    expect(await screen.findByText('No mínimo 12 caracteres')).toBeInTheDocument();
    expect(screen.getByText('Ao menos uma letra maiúscula')).toBeInTheDocument();
    expect(screen.queryByText(/ao menos um símbolo/i)).not.toBeInTheDocument();
  });

  it('valida os campos e a confirmação antes de enviar', async () => {
    const fetchMock = api();
    renderApp('/trocar-senha', fetchMock);

    await userEvent.type(await screen.findByLabelText('Senha atual'), 'Provisoria1');
    await userEvent.type(screen.getByLabelText('Senha nova'), 'SenhaNova#2026');
    await userEvent.type(screen.getByLabelText('Confirme a senha'), 'outra');
    await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(await screen.findByText('As senhas não conferem')).toBeInTheDocument();
    expect(chamadasPara(fetchMock, '/api/auth/trocar-senha')).toHaveLength(0);
  });

  it('troca a senha e volta para a tela pedida', async () => {
    const fetchMock = api({
      rotas: { '/api/auth/trocar-senha': () => new Response(null, { status: 204 }) },
    });
    const { router } = renderApp('/trocar-senha?redirect=%2Fclientes', fetchMock);

    await userEvent.type(await screen.findByLabelText('Senha atual'), 'Provisoria1');
    await userEvent.type(screen.getByLabelText('Senha nova'), 'SenhaNova#2026');
    await userEvent.type(screen.getByLabelText('Confirme a senha'), 'SenhaNova#2026');
    await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/clientes'));
    const [, init] = chamadasPara(fetchMock, '/api/auth/trocar-senha')[0] ?? [];
    expect(corpo(init)).toEqual({ senhaAtual: 'Provisoria1', senhaNova: 'SenhaNova#2026' });
  });

  it('mostra as mensagens da política devolvidas pelo servidor no campo da senha nova', async () => {
    const erro = {
      statusCode: 400,
      code: 'SENHA_FORA_DA_POLITICA',
      message: 'A senha deve ter no mínimo 12 caracteres',
      details: [{ field: 'senhaNova', message: 'A senha deve ter no mínimo 12 caracteres' }],
    };
    renderApp('/trocar-senha', api({ rotas: { '/api/auth/trocar-senha': () => json(erro, 400) } }));

    await userEvent.type(await screen.findByLabelText('Senha atual'), 'Provisoria1');
    await userEvent.type(screen.getByLabelText('Senha nova'), 'curta123');
    await userEvent.type(screen.getByLabelText('Confirme a senha'), 'curta123');
    await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(await screen.findByText('A senha deve ter no mínimo 12 caracteres')).toBeInTheDocument();
  });

  it('em inglês: textos e regras traduzidos', async () => {
    const usuario = {
      ...PROVISORIA,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    renderApp('/trocar-senha', api({ usuario }));

    expect(await screen.findByLabelText('Current password')).toBeInTheDocument();
    expect(await screen.findByText('At least 12 characters')).toBeInTheDocument();
    expect(screen.getByText('At least one uppercase letter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
  });

  it('em espanhol: textos e regras traduzidos', async () => {
    const usuario = {
      ...PROVISORIA,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'es' as const },
    };
    renderApp('/trocar-senha', api({ usuario }));

    expect(await screen.findByLabelText('Contraseña actual')).toBeInTheDocument();
    expect(await screen.findByText('Al menos 12 caracteres')).toBeInTheDocument();
  });

  it('senha sem troca pendente acessa as telas normalmente', async () => {
    const { router } = renderApp('/clientes', apiFalsa());

    expect(await screen.findByRole('button', { name: 'Menu do usuário' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/clientes');
  });
});
