import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { aplicarIdioma } from '@/lib/i18n';
import { apiFalsa, json, renderApp } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const TOKEN = 'token-de-teste-com-mais-de-vinte-caracteres';
const API = `/api/pesquisa-profissional-publica/${TOKEN}`;
const ROTA = `/pesquisa-profissional/responder?token=${TOKEN}`;

type Estado = { aberta: boolean; motivo: 'RESPONDIDA' | 'EXPIRADA' | null };
const ABERTA: Estado = { aberta: true, motivo: null };

function renderPagina(
  estado: Estado = ABERTA,
  post: () => Response = () => new Response(null, { status: 204 }),
  idioma?: 'en',
) {
  // Sem sessão não há preferência salva: vale o idioma aplicado.
  if (idioma) aplicarIdioma(idioma);
  const fetchMock = apiFalsa({
    // Página pública: sem sessão (o refresh responde 401).
    usuario: null,
    rotas: {
      [API]: (init) =>
        init?.method === 'POST' ? post() : json({ profissional: 'Dra. Ana Fictícia', ...estado }),
    },
  });
  return { user: userEvent.setup(), ...renderApp(ROTA, fetchMock) };
}

async function preencher(user: ReturnType<typeof userEvent.setup>) {
  for (const campo of ['Estrutura', 'Recepção', 'Agenda', 'Atendimento']) {
    await user.click(screen.getByRole('radio', { name: `${campo}: 4` }));
  }
  await user.click(
    screen.getByRole('radio', {
      name: 'De 0 a 10, quanto você recomendaria o Torres a um colega?: 9',
    }),
  );
}

const corpoDoPost = (fetchMock: ReturnType<typeof apiFalsa>) => {
  const post = fetchMock.mock.calls.find(([url, init]) => url === API && init?.method === 'POST');
  return post ? JSON.parse(String(post[1]?.body)) : undefined;
};

describe('Resposta da pesquisa do profissional (/pesquisa-profissional/responder)', () => {
  it('abre sem login, cumprimenta o profissional e mostra as 4 categorias e o NPS', async () => {
    renderPagina();
    expect(await screen.findByText(/Olá, Dra\. Ana Fictícia!/)).toBeVisible();
    for (const campo of ['Estrutura', 'Recepção', 'Agenda', 'Atendimento']) {
      expect(screen.getAllByRole('radio', { name: new RegExp(`^${campo}: `) })).toHaveLength(5);
    }
    expect(screen.getAllByRole('radio', { name: /quanto você recomendaria/ })).toHaveLength(11);
  });

  it('valida: sem nenhuma nota mostra "é obrigatória" por campo e não envia', async () => {
    const { user, fetchMock } = renderPagina();
    await user.click(await screen.findByRole('button', { name: 'Enviar resposta' }));
    expect(await screen.findByText('Nota de Estrutura é obrigatória.')).toBeVisible();
    expect(screen.getByText('Nota de Recepção é obrigatória.')).toBeVisible();
    expect(screen.getByText('Nota de Agenda é obrigatória.')).toBeVisible();
    expect(screen.getByText('Nota de Atendimento é obrigatória.')).toBeVisible();
    expect(screen.getByText('Nota NPS é obrigatória.')).toBeVisible();
    expect(corpoDoPost(fetchMock)).toBeUndefined();
  });

  it('envia as estrelas, o NPS e o comentário e agradece', async () => {
    const { user, fetchMock } = renderPagina();
    await screen.findByText(/Olá, Dra\. Ana Fictícia!/);
    await preencher(user);
    await user.type(screen.getByLabelText('Comentário (opcional)'), 'Tudo certo por aqui');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    await waitFor(() =>
      expect(corpoDoPost(fetchMock)).toEqual({
        notaEstrutura: 4,
        notaRecepcao: 4,
        notaAgenda: 4,
        notaAtendimento: 4,
        nps: 9,
        comentario: 'Tudo certo por aqui',
      }),
    );
    expect(await screen.findByText('Obrigado! Sua resposta foi registrada.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enviar resposta' })).not.toBeInTheDocument();
  });

  it('erro do servidor (ex.: já respondida em outra aba) aparece no formulário', async () => {
    const { user } = renderPagina(ABERTA, () =>
      json(
        {
          statusCode: 409,
          code: 'PESQUISA_JA_RESPONDIDA',
          message: 'Esta pesquisa já foi respondida',
        },
        409,
      ),
    );
    await screen.findByText(/Olá, Dra\. Ana Fictícia!/);
    await preencher(user);
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta pesquisa já foi respondida');
  });

  it.each([
    [
      { aberta: false, motivo: 'RESPONDIDA' as const },
      'Esta pesquisa já foi respondida. Obrigado!',
    ],
    [{ aberta: false, motivo: 'EXPIRADA' as const }, 'O link desta pesquisa expirou.'],
  ])('pesquisa fechada (%o) mostra o aviso e nenhum formulário', async (estado, aviso) => {
    renderPagina(estado);
    expect(await screen.findByText(aviso, { selector: '[role=status]' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enviar resposta' })).not.toBeInTheDocument();
  });

  it('link sem token ou desconhecido mostra "link inválido"', async () => {
    const fetchMock = apiFalsa({
      usuario: null,
      rotas: {
        [API]: () =>
          json(
            {
              statusCode: 404,
              code: 'PESQUISA_NAO_ENCONTRADA',
              message: 'Pesquisa não encontrada',
            },
            404,
          ),
      },
    });
    renderApp(ROTA, fetchMock);
    expect(
      await screen.findByText('Este link não é válido.', { selector: '[role=status]' }),
    ).toBeVisible();
  });

  it('em inglês: textos da página traduzidos', async () => {
    const { user } = renderPagina(ABERTA, undefined, 'en');
    expect(await screen.findByText(/Hello, Dra\. Ana Fictícia!/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText('Facilities score is required.')).toBeVisible();
  });
});
