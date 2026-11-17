import type { CanalWhatsapp, UsuarioCanalWhatsapp } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/configuracoes-gestao/canais-whatsapp';
const API_USUARIOS = `${API}/usuarios-disponiveis`;
const ID_1 = '00000000-0000-4000-8000-0000000000c1';
const ID_2 = '00000000-0000-4000-8000-0000000000c2';
const USUARIO_1 = '00000000-0000-4000-8000-0000000000a1';
const USUARIO_2 = '00000000-0000-4000-8000-0000000000a2';

function canal(parcial: Partial<CanalWhatsapp>): CanalWhatsapp {
  return {
    id: ID_1,
    nome: 'Recepção',
    numero: '5565998500704',
    tipo: 'DINASTI_API',
    status: 'CONECTADO',
    profissionalId: null,
    profissionalNome: null,
    usuarioIds: [],
    createdAt: '2026-11-17T12:00:00.000Z',
    updatedAt: '2026-11-17T12:00:00.000Z',
    ...parcial,
  };
}

const CANAIS = [
  canal({ usuarioIds: [USUARIO_1] }),
  canal({ id: ID_2, nome: 'Teste', numero: '5547996964635', status: 'DESCONECTADO' }),
];

const USUARIOS: UsuarioCanalWhatsapp[] = [
  { id: USUARIO_1, nome: 'Usuario Um', email: 'um@example.com', perfil: 'Médico' },
  { id: USUARIO_2, nome: 'Usuario Dois', email: 'dois@example.com', perfil: 'Admin' },
];

function pagina(data: CanalWhatsapp[]) {
  return json({ data, meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 } });
}

function corpoDe(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => pagina(CANAIS),
      [API_USUARIOS]: () => json(USUARIOS),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/agentes-ia', fetchMock) };
}

function cardDe(nome: string) {
  return within(screen.getByRole('heading', { name: nome }).closest('li') as HTMLElement);
}

describe('Agentes IA, Canais WhatsApp (/agentes-ia)', () => {
  it('mostra título, descrição, "Novo Canal" e um card por canal com telefone, tipo e status', async () => {
    renderTela();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Canais WhatsApp' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Gerencie seus canais de WhatsApp conectados.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Canal' })).toBeVisible();

    await screen.findByRole('heading', { name: 'Recepção' });
    const recepcao = cardDe('Recepção');
    expect(recepcao.getByText('(65) 99850-0704')).toBeVisible();
    expect(recepcao.getByText('DinastiAPI')).toBeVisible();
    expect(recepcao.getByText('Conectado')).toBeVisible();
    expect(cardDe('Teste').getByText('Desconectado')).toBeVisible();
  });

  it('lista vazia mostra o estado vazio e abre o modal Novo Canal', async () => {
    const { user } = renderTela(api({ rotas: { [API]: () => pagina([]) } }));

    expect(await screen.findByText('Nenhum canal cadastrado')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Criar primeiro canal' }));

    expect(await screen.findByRole('dialog', { name: 'Novo Canal WhatsApp' })).toBeVisible();
  });

  it('sem permissão de criar, editar e excluir, não mostra os botões', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: ['configuracoes-gestao.agentes-ia.ver' as const],
    };
    renderApp('/agentes-ia', api({ usuario }));

    await screen.findByRole('heading', { name: 'Recepção' });
    expect(screen.queryByRole('button', { name: 'Novo Canal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excluir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver \/ Editar/ })).not.toBeInTheDocument();
  });

  it('Novo Canal: campos do inventário, usuários com nome e perfil', async () => {
    const { user } = renderTela();
    await screen.findByText('Recepção');

    await user.click(screen.getByRole('button', { name: 'Novo Canal' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Novo Canal WhatsApp' }));

    expect(modal.getByText('DinastiAPI')).toBeVisible();
    expect(modal.getByPlaceholderText('Ex: Recepcao Principal')).toHaveValue('');
    expect(modal.getByPlaceholderText('+55 (11) 99999-9999')).toHaveValue('');
    expect(modal.getByText('Usuarios com acesso')).toBeVisible();
    expect(await modal.findByText('Usuario Um')).toBeVisible();
    expect(modal.getByText('Admin')).toBeVisible();
    expect(modal.getByRole('button', { name: 'Criar' })).toBeVisible();
    expect(modal.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  });

  it('Novo Canal: campos vazios mostram as mensagens de obrigatório e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Recepção');

    await user.click(screen.getByRole('button', { name: 'Novo Canal' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Novo Canal WhatsApp' }));
    await user.click(modal.getByRole('button', { name: 'Criar' }));

    expect(await modal.findByText('Nome do Canal é obrigatório.')).toBeVisible();
    expect(modal.getByText('Número WhatsApp é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Novo Canal: envia nome, número normalizado e usuários marcados; fecha e recarrega', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(CANAIS);
          corpo = corpoDe(init);
          return json(canal({ id: '00000000-0000-4000-8000-0000000000c3' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Recepção');

    await user.click(screen.getByRole('button', { name: 'Novo Canal' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Novo Canal WhatsApp' }));
    await user.type(modal.getByPlaceholderText('Ex: Recepcao Principal'), 'Financeiro');
    await user.type(modal.getByPlaceholderText('+55 (11) 99999-9999'), '(65) 99999-0000');
    await user.click(await modal.findByRole('checkbox', { name: /Usuario Dois/ }));
    await user.click(modal.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      nome: 'Financeiro',
      numero: '5565999990000',
      profissionalId: null,
      usuarioIds: [USUARIO_2],
    });
    expect(
      chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
    ).toHaveLength(2);
  });

  it('número já usado (400 da API) aparece no campo', async () => {
    const mensagem = 'Já existe um canal com este número';
    const { user } = renderTela(
      api({
        rotas: {
          [API]: (init) =>
            init?.method === 'POST'
              ? json(
                  {
                    statusCode: 400,
                    code: 'NUMERO_DUPLICADO',
                    message: mensagem,
                    details: [{ field: 'numero', message: mensagem }],
                  },
                  400,
                )
              : pagina(CANAIS),
        },
      }),
    );
    await screen.findByText('Recepção');

    await user.click(screen.getByRole('button', { name: 'Novo Canal' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Novo Canal WhatsApp' }));
    await user.type(modal.getByPlaceholderText('Ex: Recepcao Principal'), 'Outro');
    await user.type(modal.getByPlaceholderText('+55 (11) 99999-9999'), '65998500704');
    await user.click(modal.getByRole('button', { name: 'Criar' }));

    expect(await modal.findByText(mensagem)).toBeVisible();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Ver / Editar canal: abre com nome e telefone atuais e envia PATCH', async () => {
    let corpo: Record<string, unknown> = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: (init) => {
            corpo = corpoDe(init);
            return json(canal({ nome: 'Recepção 2' }));
          },
        },
      }),
    );
    await screen.findByText('Recepção');

    await user.click(screen.getByRole('button', { name: 'Ver / Editar canal Recepção' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Editar Canal DinastiAPI' }));
    expect(modal.getByLabelText('Nome do Canal')).toHaveValue('Recepção');
    expect(modal.getByLabelText('Telefone')).toHaveValue('(65) 99850-0704');
    await user.type(modal.getByLabelText('Nome do Canal'), ' 2');
    await user.click(modal.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({ nome: 'Recepção 2', numero: '5565998500704', profissionalId: null });
  });

  it('Gerenciar usuarios: marca os que têm acesso e salva com PUT', async () => {
    let corpo: Record<string, unknown> = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}/usuarios`]: (init) => {
            corpo = corpoDe(init);
            return json(canal({ usuarioIds: [USUARIO_1, USUARIO_2] }));
          },
        },
      }),
    );
    await screen.findByText('Recepção');

    await user.click(screen.getByRole('button', { name: 'Gerenciar usuarios de Recepção' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Usuarios — Recepção' }));
    const um = await modal.findByRole('checkbox', { name: /Usuario Um/ });
    expect(um).toBeChecked();
    expect(modal.getByText('um@example.com')).toBeVisible();
    expect(modal.getByRole('checkbox', { name: /Usuario Dois/ })).not.toBeChecked();

    await user.click(modal.getByRole('checkbox', { name: /Usuario Dois/ }));
    await user.click(modal.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({ usuarioIds: [USUARIO_1, USUARIO_2] });
  });

  it('Excluir: pede confirmação; Cancelar não exclui e Excluir envia DELETE', async () => {
    let excluidos = 0;
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_2}`]: () => {
          excluidos += 1;
          return json(canal({ id: ID_2 }));
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Teste');

    await user.click(screen.getByRole('button', { name: 'Excluir Teste' }));
    const confirmacao = within(await screen.findByRole('alertdialog'));
    expect(confirmacao.getByText(/Tem certeza que deseja excluir o canal "Teste"/)).toBeVisible();
    await user.click(confirmacao.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidos).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Excluir Teste' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );

    await waitFor(() => expect(excluidos).toBe(1));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(
      chamadasPara(fetchMock, `${API}/${ID_2}`).every(([, init]) => init?.method === 'DELETE'),
    ).toBe(true);
  });
});
