import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { aplicarIdioma } from '@/lib/i18n';
import {
  apiFalsa,
  chamadasPara,
  json,
  renderApp,
  sessaoJson,
  USUARIO_TESTE,
} from '../../../test/render-app';

const ERRO_LOGIN = {
  statusCode: 401,
  code: 'CREDENCIAIS_INVALIDAS',
  message: 'E-mail ou senha inválidos',
};

function corpo(init?: RequestInit): unknown {
  return JSON.parse(String(init?.body));
}

describe('rota protegida', () => {
  it('sem sessão vai para o login, guardando a tela pedida', async () => {
    const { router } = renderApp('/clientes', apiFalsa({ usuario: null }));

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?redirect=%2Fclientes');
  });

  it('mostra "Sem permissão" na tela que o perfil não libera, e o menu só com as permitidas', async () => {
    const usuario = { ...USUARIO_TESTE, permissoes: ['financeiro.caixas.ver' as const] };
    renderApp('/clientes', apiFalsa({ usuario }));

    expect(await screen.findByRole('heading', { name: 'Sem permissão' })).toBeInTheDocument();
    const menu = screen
      .getByRole('button', { name: 'FINANCEIRO' })
      .closest('[data-slot="sidebar"]');
    expect(menu).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: 'COMERCIAL / ATENDIMENTO' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PAINEL' })).not.toBeInTheDocument();
  });

  it('mostra o usuário logado no cabeçalho', async () => {
    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Menu do usuário' }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Pessoa de Teste')).toBeInTheDocument();
    expect(within(menu).getByText('Administrador')).toBeInTheDocument();
  });

  it('sai pelo rodapé do menu lateral', async () => {
    const { router, fetchMock } = renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(chamadasPara(fetchMock, '/api/auth/logout')).toHaveLength(1);
  });
});

describe('LoginPage', () => {
  it('em espanhol: textos, validação e erro do servidor pelo code (issue #205)', async () => {
    aplicarIdioma('es');
    renderApp(
      '/login',
      apiFalsa({ usuario: null, rotas: { '/api/auth/login': () => json(ERRO_LOGIN, 401) } }),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Ingresar' }));
    expect(screen.getByText('Ingrese el correo electrónico')).toBeInTheDocument();
    expect(screen.getByText('Ingrese la contraseña')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'pessoa@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Correo electrónico o contraseña no válidos',
    );
  });

  it('valida e-mail e senha antes de enviar', async () => {
    const fetchMock = apiFalsa({ usuario: null });
    renderApp('/login', fetchMock);

    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(screen.getByText('Informe o e-mail')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(chamadasPara(fetchMock, '/api/auth/login')).toHaveLength(0);
  });

  it('mostra o erro do servidor quando o login falha', async () => {
    renderApp(
      '/login',
      apiFalsa({ usuario: null, rotas: { '/api/auth/login': () => json(ERRO_LOGIN, 401) } }),
    );

    await userEvent.type(await screen.findByLabelText('E-mail'), 'pessoa@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos');
  });

  it('mostra os erros por campo do 400', async () => {
    const erro400 = {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos',
      details: [{ field: 'email', message: 'E-mail inválido' }],
    };
    renderApp(
      '/login',
      apiFalsa({ usuario: null, rotas: { '/api/auth/login': () => json(erro400, 400) } }),
    );

    await userEvent.type(await screen.findByLabelText('E-mail'), 'pessoa@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('E-mail inválido')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('entra e volta para a tela pedida', async () => {
    const fetchMock = apiFalsa({
      usuario: null,
      rotas: { '/api/auth/login': () => sessaoJson() },
    });
    const { router } = renderApp('/clientes', fetchMock);

    await userEvent.type(await screen.findByLabelText('E-mail'), ' Pessoa@Example.com ');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-certa-1');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Pacientes' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/clientes');
    const [login] = chamadasPara(fetchMock, '/api/auth/login');
    expect(corpo(login?.[1])).toEqual({ email: 'pessoa@example.com', senha: 'senha-certa-1' });
  });

  it('leva ao "Esqueci minha senha"', async () => {
    const { router } = renderApp('/login', apiFalsa({ usuario: null }));

    await userEvent.click(await screen.findByRole('link', { name: 'Esqueci minha senha' }));

    expect(router.state.location.pathname).toBe('/esqueci-senha');
  });
});

describe('EsqueciSenhaPage', () => {
  it('valida o e-mail e confirma o envio sem revelar se a conta existe', async () => {
    const fetchMock = apiFalsa({
      usuario: null,
      rotas: { '/api/auth/esqueci-senha': () => new Response(null, { status: 202 }) },
    });
    renderApp('/esqueci-senha', fetchMock);

    await userEvent.click(await screen.findByRole('button', { name: 'Enviar link' }));
    expect(screen.getByText('Informe o e-mail')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('E-mail'), 'pessoa@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.',
    );
    const [pedido] = chamadasPara(fetchMock, '/api/auth/esqueci-senha');
    expect(corpo(pedido?.[1])).toEqual({ email: 'pessoa@example.com' });
  });

  it('mostra o erro do servidor (ex.: muitas tentativas)', async () => {
    const erro429 = { statusCode: 429, code: 'TOO_MANY_REQUESTS', message: 'Muitas requisições' };
    renderApp(
      '/esqueci-senha',
      apiFalsa({ usuario: null, rotas: { '/api/auth/esqueci-senha': () => json(erro429, 429) } }),
    );

    await userEvent.type(await screen.findByLabelText('E-mail'), 'pessoa@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas requisições');
  });
});

describe('RedefinirSenhaPage', () => {
  function preencher(senha: string, confirmacao: string) {
    return (async () => {
      await userEvent.type(await screen.findByLabelText('Senha nova'), senha);
      await userEvent.type(screen.getByLabelText('Confirme a senha'), confirmacao);
      await userEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));
    })();
  }

  it('sem token no link, orienta a pedir outro', async () => {
    renderApp('/redefinir-senha', apiFalsa({ usuario: null }));

    expect(await screen.findByRole('status')).toHaveTextContent('Peça um novo link');
  });

  it('valida o tamanho da senha nova', async () => {
    renderApp('/redefinir-senha?token=abc', apiFalsa({ usuario: null }));

    await preencher('curta', 'curta');

    expect(screen.getByText('A senha deve ter no mínimo 8 caracteres')).toBeInTheDocument();
  });

  it('confere a confirmação da senha', async () => {
    renderApp('/redefinir-senha?token=abc', apiFalsa({ usuario: null }));

    await preencher('senha-nova-1', 'senha-nova-2');

    expect(screen.getByText('As senhas não conferem')).toBeInTheDocument();
  });

  it('troca a senha com o token do link', async () => {
    const fetchMock = apiFalsa({
      usuario: null,
      rotas: { '/api/auth/redefinir-senha': () => new Response(null, { status: 204 }) },
    });
    renderApp('/redefinir-senha?token=abc', fetchMock);

    await preencher('senha-nova-1', 'senha-nova-1');

    expect(await screen.findByRole('status')).toHaveTextContent('Sua senha foi alterada');
    const [pedido] = chamadasPara(fetchMock, '/api/auth/redefinir-senha');
    expect(corpo(pedido?.[1])).toEqual({ token: 'abc', senha: 'senha-nova-1' });
  });

  it('link inválido ou expirado aparece como erro geral', async () => {
    const erro = {
      statusCode: 400,
      code: 'LINK_REDEFINICAO_INVALIDO',
      message: 'Link de redefinição inválido ou expirado',
      details: [{ field: 'token', message: 'Link de redefinição inválido ou expirado' }],
    };
    renderApp(
      '/redefinir-senha?token=velho',
      apiFalsa({ usuario: null, rotas: { '/api/auth/redefinir-senha': () => json(erro, 400) } }),
    );

    await preencher('senha-nova-1', 'senha-nova-1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Link de redefinição inválido ou expirado',
    );
  });

  it('erro sem details aparece como erro geral', async () => {
    const erro = { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro interno' };
    renderApp(
      '/redefinir-senha?token=abc',
      apiFalsa({ usuario: null, rotas: { '/api/auth/redefinir-senha': () => json(erro, 500) } }),
    );

    await preencher('senha-nova-1', 'senha-nova-1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno');
  });
});
