import { PERMISSOES, type Protocolo, type ProtocoloMae } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/gestao-profissionais/protocolos';
const API_MAE = '/api/gestao-profissionais/protocolos-mae';
const PROF_A = '00000000-0000-4000-8000-0000000000a1';
const PROD_1 = '00000000-0000-4000-8000-0000000000c1';
const ID_1 = '00000000-0000-4000-8000-0000000000b1';
const ID_2 = '00000000-0000-4000-8000-0000000000b2';
const ID_MAE = '00000000-0000-4000-8000-0000000000d1';

function protocolo(parcial: Partial<Protocolo>): Protocolo {
  return {
    id: ID_1,
    nome: 'Limpeza de pele',
    tipo: 'procedimento',
    categoria: 'Estética',
    profissionalId: PROF_A,
    profissionalNome: 'Dra. Ana Teste',
    totalSemanas: 1,
    valorTotal: 250,
    sessoes: 1,
    observacoes: 'Parcelamento em até 6x',
    itens: [],
    emUso: false,
    createdAt: '2026-10-21T12:00:00.000Z',
    updatedAt: '2026-10-21T12:00:00.000Z',
    ...parcial,
  };
}

const PROTOCOLOS = [
  protocolo({}),
  protocolo({
    id: ID_2,
    nome: 'Método Lipo',
    categoria: 'Geral',
    valorTotal: 1210,
    totalSemanas: 4,
    sessoes: 2,
    observacoes: null,
    itens: [{ produtoId: PROD_1, produtoNome: 'Glow Face Massage', quantidade: 2 }],
    emUso: true,
  }),
];

const MAE: ProtocoloMae = {
  id: ID_MAE,
  nome: 'Facial completo',
  categoria: 'Geral',
  totalSemanas: 2,
  valorTotal: 900,
  descricao: 'Duas semanas',
  semanas: [
    { semana: 1, protocoloId: ID_1, protocoloNome: 'Limpeza de pele', observacoes: null },
    { semana: 2, protocoloId: null, protocoloNome: null, observacoes: 'Retorno' },
  ],
  createdAt: '2026-10-21T12:00:00.000Z',
  updatedAt: '2026-10-21T12:00:00.000Z',
};

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 } });
}

const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;
const ehLeitura = (init?: RequestInit) => !init?.method || init.method === 'GET';

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => pagina(PROTOCOLOS),
      [`${API}/categorias`]: () => json({ data: ['Estética', 'Geral'] }),
      [API_MAE]: () => pagina([MAE]),
      '/api/lookups/profissionais': () =>
        json({
          data: [{ id: PROF_A, label: 'Dra. Ana Teste', descricao: null }],
          meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
        }),
      '/api/lookups/produtos': () =>
        json({
          data: [{ id: PROD_1, label: 'Glow Face Massage', descricao: null }],
          meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
        }),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/protocolos', fetchMock) };
}

const card = (nome: string) =>
  screen.getByRole('heading', { name: nome }).closest('li') as HTMLElement;

describe('Protocolos (/protocolos)', () => {
  it('agrupa por categoria e mostra tipo, itens, profissional, valor e valor por semana', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { level: 1, name: 'Protocolos' })).toBeVisible();
    expect(
      screen.getByText('Conjuntos de procedimentos/produtos para aplicar no atendimento'),
    ).toBeVisible();
    expect(await screen.findByRole('heading', { level: 2, name: /Estética/ })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: /Geral/ })).toBeVisible();

    const limpeza = card('Limpeza de pele');
    expect(within(limpeza).getByText('Procedimento')).toBeVisible();
    expect(within(limpeza).getByText('Dra. Ana Teste')).toBeVisible();
    expect(within(limpeza).getByText(/\(.*250,00\/semana\)/)).toBeVisible();
    expect(within(limpeza).getByText('1 semana')).toBeVisible();
    const lipo = card('Método Lipo');
    expect(within(lipo).getByText('1 item')).toBeVisible();
    expect(within(lipo).getByText('4 semanas')).toBeVisible();
    expect(within(lipo).getByText(/302,50\/semana/)).toBeVisible();
  });

  it('Detalhar abre tipo, sessões e itens; Fechar recolhe', async () => {
    const { user } = renderTela();
    await screen.findByText('Método Lipo');

    await user.click(screen.getByRole('button', { name: 'Detalhar Método Lipo' }));
    const lipo = card('Método Lipo');
    expect(within(lipo).getByText('Sessões:')).toBeVisible();
    expect(within(lipo).getByText('Glow Face Massage x2')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Detalhar Limpeza de pele' }));
    expect(
      within(card('Limpeza de pele')).getByText('Nenhum item/produto cadastrado'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Fechar Método Lipo' }));
    expect(within(card('Método Lipo')).queryByText('Sessões:')).not.toBeInTheDocument();
  });

  it('busca e filtros de categoria e profissional consultam a API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Método Lipo');

    await user.type(screen.getByLabelText('Buscar'), 'lipo');
    await waitFor(() => {
      const ultima = chamadasPara(fetchMock, API).at(-1)?.[0] ?? '';
      expect(new URL(ultima, 'http://x').searchParams.get('search')).toBe('lipo');
    });

    await user.click(screen.getByRole('combobox', { name: 'Categoria' }));
    await user.click(await screen.findByRole('option', { name: 'Geral' }));
    await waitFor(() => {
      const ultima = chamadasPara(fetchMock, API).at(-1)?.[0] ?? '';
      expect(new URL(ultima, 'http://x').searchParams.get('categoria')).toBe('Geral');
    });

    await user.click(screen.getByRole('combobox', { name: 'Profissional' }));
    await user.click(await screen.findByRole('option', { name: /Dra. Ana Teste/ }));
    await waitFor(() => {
      const ultima = chamadasPara(fetchMock, API).at(-1)?.[0] ?? '';
      expect(new URL(ultima, 'http://x').searchParams.get('profissionalId')).toBe(PROF_A);
    });
  });

  it('lista vazia mostra o estado vazio', async () => {
    renderTela(api({ rotas: { [API]: () => pagina([]) } }));

    expect(await screen.findByText('Nenhum protocolo cadastrado')).toBeVisible();
    expect(screen.getByText('Crie protocolos com itens de produtos/serviços')).toBeVisible();
  });

  it('Novo Protocolo: nome é obrigatório e nada é enviado sem ele', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Método Lipo');

    await user.click(screen.getByRole('button', { name: 'Novo Protocolo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Protocolo' });
    expect(within(modal).getByLabelText('Total de Semanas')).toHaveValue(1);
    expect(within(modal).getByLabelText('Categoria')).toHaveValue('Geral');

    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Novo Protocolo: adiciona item, envia o corpo e fecha o modal', async () => {
    let corpo: Record<string, unknown> = {};
    const { user } = renderTela(
      api({
        rotas: {
          [API]: (init) => {
            if (ehLeitura(init)) return pagina(PROTOCOLOS);
            corpo = corpoDe(init);
            return json(protocolo({ nome: 'Novo' }), 201);
          },
        },
      }),
    );
    await screen.findByText('Método Lipo');

    await user.click(screen.getByRole('button', { name: 'Novo Protocolo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Protocolo' });
    await user.type(within(modal).getByLabelText(/Nome/), 'Dia D');
    await user.click(
      within(modal).getByRole('combobox', { name: 'Itens do Protocolo (composição)' }),
    );
    await user.click(await screen.findByRole('option', { name: /Glow Face Massage/ }));
    expect(within(modal).getByText('Glow Face Massage')).toBeVisible();
    await user.clear(within(modal).getByLabelText('Quantidade de Glow Face Massage'));
    await user.type(within(modal).getByLabelText('Quantidade de Glow Face Massage'), '3');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      nome: 'Dia D',
      tipo: 'procedimento',
      categoria: 'Geral',
      profissionalId: null,
      totalSemanas: 1,
      valorTotal: 0,
      observacoes: null,
      itens: [{ produtoId: PROD_1, quantidade: 3 }],
    });
  });

  it('nome repetido (409) aparece no campo Nome e mantém o modal aberto', async () => {
    const { user } = renderTela(
      api({
        rotas: {
          [API]: (init) =>
            ehLeitura(init)
              ? pagina(PROTOCOLOS)
              : json(
                  {
                    statusCode: 409,
                    code: 'PROTOCOLO_DUPLICADO',
                    message: 'Já existe um protocolo com este nome.',
                    details: [{ field: 'nome', message: 'Já existe um protocolo com este nome.' }],
                  },
                  409,
                ),
        },
      }),
    );
    await screen.findByText('Método Lipo');

    await user.click(screen.getByRole('button', { name: 'Novo Protocolo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Protocolo' });
    await user.type(within(modal).getByLabelText(/Nome/), 'Limpeza de pele');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    expect(await within(modal).findByText('Já existe um protocolo com este nome.')).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Novo Protocolo' })).toBeVisible();
  });

  it('Editar Protocolo: abre com os valores atuais e envia PATCH', async () => {
    let corpo: Record<string, unknown> = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: (init) => {
            corpo = corpoDe(init);
            return json(protocolo({ id: ID_2 }));
          },
        },
      }),
    );
    await screen.findByText('Método Lipo');

    await user.click(screen.getByRole('button', { name: 'Editar Método Lipo' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Protocolo' });
    expect(within(modal).getByLabelText(/Nome/)).toHaveValue('Método Lipo');
    expect(within(modal).getByLabelText('Total de Semanas')).toHaveValue(4);
    expect(within(modal).getByText('Glow Face Massage')).toBeVisible();
    await user.type(within(modal).getByLabelText(/Nome/), ' 2');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      nome: 'Método Lipo 2',
      totalSemanas: 4,
      valorTotal: 1210,
      itens: [{ produtoId: PROD_1, quantidade: 2 }],
    });
  });

  it('Duplicar chama o POST /duplicar', async () => {
    let duplicado = false;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}/duplicar`]: () => {
            duplicado = true;
            return json(protocolo({ nome: 'Cópia de Limpeza de pele' }), 201);
          },
        },
      }),
    );
    await screen.findByText('Método Lipo');

    await user.click(screen.getByRole('button', { name: 'Duplicar Limpeza de pele' }));

    await waitFor(() => expect(duplicado).toBe(true));
  });

  it('Excluir: confirma em modal; protocolo usado em protocolo mãe fica com a lixeira desabilitada', async () => {
    let excluido = false;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluido = true;
            return json(protocolo({}));
          },
        },
      }),
    );
    await screen.findByText('Método Lipo');

    expect(screen.getByRole('button', { name: 'Excluir Método Lipo' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Excluir Limpeza de pele' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir protocolo?' });
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(excluido).toBe(true));
  });

  it('aba Protocolos Mãe: lista, detalha as semanas e mostra o estado vazio', async () => {
    const { user } = renderTela();
    await screen.findByText('Método Lipo');

    await user.click(screen.getByRole('tab', { name: 'Protocolos Mãe' }));
    expect(await screen.findByText('Facial completo')).toBeVisible();
    expect(screen.queryByLabelText('Buscar')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Detalhar Facial completo' }));
    expect(screen.getByText('Semana 1:')).toBeVisible();
    expect(screen.getByText('Sem protocolo')).toBeVisible();
  });

  it('aba Protocolos Mãe vazia mostra a mensagem do inventário', async () => {
    const { user } = renderTela(api({ rotas: { [API_MAE]: () => pagina([]) } }));
    await screen.findByText('Método Lipo');

    await user.click(screen.getByRole('tab', { name: 'Protocolos Mãe' }));

    expect(await screen.findByText('Nenhum protocolo mãe cadastrado')).toBeVisible();
  });

  it('Novo Protocolo Mãe: valida o nome, gera uma linha por semana e envia o corpo', async () => {
    let corpo: Record<string, unknown> = {};
    const { user } = renderTela(
      api({
        rotas: {
          [API_MAE]: (init) => {
            if (ehLeitura(init)) return pagina([]);
            corpo = corpoDe(init);
            return json(MAE, 201);
          },
        },
      }),
    );
    await screen.findByText('Método Lipo');
    await user.click(screen.getByRole('tab', { name: 'Protocolos Mãe' }));
    await screen.findByText('Nenhum protocolo mãe cadastrado');

    await user.click(screen.getByRole('button', { name: 'Novo Protocolo Mãe' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Protocolo Mãe' });
    expect(within(modal).getByText('Semana 1')).toBeVisible();
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();

    await user.type(within(modal).getByLabelText(/Nome/), 'Facial');
    await user.clear(within(modal).getByLabelText(/Total de Semanas/));
    await user.type(within(modal).getByLabelText(/Total de Semanas/), '2');
    expect(await within(modal).findByText('Semana 2')).toBeVisible();
    await user.click(within(modal).getByRole('combobox', { name: 'Protocolo da semana 1' }));
    await user.click(await screen.findByRole('option', { name: /Limpeza de pele - R\$/ }));
    await user.type(within(modal).getByLabelText('Observações da semana 2'), 'Retorno');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      nome: 'Facial',
      categoria: 'Geral',
      totalSemanas: 2,
      valorTotal: 0,
      descricao: null,
      semanas: [
        { semana: 1, protocoloId: ID_1, observacoes: null },
        { semana: 2, protocoloId: null, observacoes: 'Retorno' },
      ],
    });
  });

  it('abas Receitas e Solic. Exames mostram filtros e estado vazio, com o botão do inventário', async () => {
    const { user } = renderTela();
    await screen.findByText('Método Lipo');

    await user.click(screen.getByRole('tab', { name: 'Receitas' }));
    expect(screen.getByRole('button', { name: 'Nova Receita' })).toBeDisabled();
    expect(screen.getByLabelText('Buscar')).toBeVisible();
    expect(screen.getByText('Nenhum protocolo cadastrado')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Solic. Exames' }));
    expect(screen.getByRole('button', { name: 'Nova Solicitação' })).toBeDisabled();
  });

  it('sem permissão de criar, editar e excluir, esconde os botões', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'gestao-profissionais.protocolos.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Método Lipo');

    expect(screen.queryByRole('button', { name: 'Novo Protocolo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Método Lipo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplicar Método Lipo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir Método Lipo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detalhar Método Lipo' })).toBeVisible();
  });
});
