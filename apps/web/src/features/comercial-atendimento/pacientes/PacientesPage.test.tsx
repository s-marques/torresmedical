import {
  PERMISSOES,
  PREFERENCIAS_PADRAO,
  type AuditLogItem,
  type Consentimento,
  type PacienteResumo as Paciente,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';
import { camposAlterados, formatarData, iniciaisDe } from './formatadores';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/pacientes';
const ID_1 = '00000000-0000-4000-8000-0000000000b1';
const ID_2 = '00000000-0000-4000-8000-0000000000b2';
const ORIGEM = '00000000-0000-4000-8000-0000000000c1';
const AGORA = '2026-10-20T12:00:00.000Z';

function paciente(parcial: Partial<Paciente>): Paciente {
  return {
    id: ID_1,
    tipo: 'PF',
    nome: 'Ana Teste',
    nomeSocial: null,
    email: 'ana@exemplo.test',
    documento: '52998224725',
    rg: null,
    menorIdade: false,
    telefone: null,
    celular: '65999990001',
    dataNascimento: '1990-05-17',
    sexo: 'FEMININO',
    profissao: null,
    origemClienteId: ORIGEM,
    origemNome: 'WhatsApp',
    status: 'NOVO',
    observacoes: null,
    aceitaCampanhasWhatsapp: true,
    aceitaComunicacao: true,
    canalOrigem: null,
    whatsapp: null,
    preferenciaComunicacao: null,
    indicacaoTipo: null,
    indicacaoReferenciaId: null,
    indicacaoTexto: null,
    indicacaoNome: null,
    profissionalVinculoId: null,
    profissionalVinculoNome: null,
    especialidadeVinculoId: null,
    especialidadeVinculoNome: null,
    primeiroAtendimento: null,
    ultimoAtendimento: null,
    proximoRetorno: null,
    faltas: 0,
    razaoSocial: null,
    nomeFantasia: null,
    inscricaoEstadual: null,
    representanteNome: null,
    representanteCelular: null,
    cep: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null,
    codigoIbge: null,
    createdAt: AGORA,
    updatedAt: AGORA,
    ...parcial,
  };
}

const PACIENTES = [
  paciente({}),
  paciente({
    id: ID_2,
    tipo: 'PJ',
    nome: 'Empresa Teste',
    documento: '11222333000181',
    celular: null,
    telefone: '6533330002',
    email: null,
    origemNome: null,
    origemClienteId: null,
    status: 'INATIVO',
  }),
];

function pagina(data: Paciente[]) {
  return json({ data, meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 } });
}

type Corpo = Record<string, unknown>;
const corpoDe = (init?: RequestInit): Corpo => JSON.parse(String(init?.body)) as Corpo;

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => pagina(PACIENTES),
      '/api/lookups/origens-cliente': () =>
        json({
          data: [{ id: ORIGEM, label: 'WhatsApp', descricao: null }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api(), usuario = USUARIO_TESTE) {
  return { user: userEvent.setup(), ...renderApp('/clientes', fetchMock), usuario };
}

/** Escolhe uma opção de um select (Radix): abre o combobox e clica na opção. */
async function escolher(
  user: ReturnType<typeof userEvent.setup>,
  combobox: HTMLElement,
  opcao: string | RegExp,
) {
  await user.click(combobox);
  await user.click(await screen.findByRole('option', { name: opcao }));
}

const idConsentimento = (n: number) => `00000000-0000-4000-8000-0000000000d${n}`;

function consentimento(parcial: Partial<Consentimento>): Consentimento {
  return {
    id: idConsentimento(1),
    pacienteId: ID_1,
    tipo: 'CAMPANHAS',
    aceito: true,
    canal: 'PRESENCIAL',
    versao: '1',
    observacao: null,
    registradoPorId: null,
    registradoPorNome: 'Atendente Fictícia',
    registradoEm: AGORA,
    ...parcial,
  };
}

/** Marca os três consentimentos do cadastro novo e o canal (obrigatórios para cadastrar). */
async function marcarConsentimentos(
  modal: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
  escolha: 'Aceito' | 'Recusado' = 'Aceito',
) {
  for (const tipo of ['Tratamento de dados', 'Comunicação', 'Campanhas']) {
    const grupo = within(modal).getByRole('radiogroup', { name: tipo });
    await user.click(within(grupo).getByRole('radio', { name: escolha }));
  }
  await user.selectOptions(
    within(modal).getByLabelText('Onde foi dado o consentimento'),
    'PRESENCIAL',
  );
}

const consulta = (fetchMock: ReturnType<typeof api>) => {
  const [url] = chamadasPara(fetchMock, API).at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
};

describe('Pacientes (/clientes)', () => {
  it('mostra o cabeçalho, as colunas do inventário e as linhas', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Pacientes' })).toBeInTheDocument();
    expect(screen.getByText('Gerencie seus pacientes e clientes.')).toBeVisible();
    const tabela = await screen.findByRole('table');
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Nome', 'Documento', 'Telefone', 'Email', 'Origem', 'Status', 'Ações']);
    expect(await screen.findByText('Ana Teste')).toBeVisible();
    expect(screen.getByText('529.982.247-25')).toBeVisible();
    expect(screen.getByText('(65) 99999-0001')).toBeVisible();
    expect(screen.getByText('(65) 3333-0002')).toBeVisible();
    expect(screen.getByText('11.222.333/0001-81')).toBeVisible();
    expect(screen.getByText('Novo')).toBeVisible();
    expect(screen.getByText('Inativo', { selector: '[data-slot="badge"]' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Paciente' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeVisible();
    expect(consulta(fetchMock)).toMatchObject({ page: '1', pageSize: '20' });
  });

  it('busca, filtro de status, ordenação e paginação chamam a API com os parâmetros', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.type(screen.getByPlaceholderText('Buscar por nome, CPF, celular, email...'), 'ana');
    await waitFor(() => expect(consulta(fetchMock)).toMatchObject({ search: 'ana' }));

    await user.click(screen.getByRole('button', { name: 'Inativo' }));
    await waitFor(() => expect(consulta(fetchMock)).toMatchObject({ status: 'INATIVO' }));

    await user.click(screen.getByRole('button', { name: 'Origem' }));
    await waitFor(() => expect(consulta(fetchMock)).toMatchObject({ sort: 'origem:asc' }));
  });

  it('clicar na linha abre o detalhe, com Fechar, Histórico e Editar', async () => {
    const { user } = renderTela();

    await user.click(await screen.findByText('Ana Teste'));

    const detalhe = await screen.findByRole('dialog', { name: 'Ana Teste' });
    expect(within(detalhe).getByText('Pessoa Física')).toBeVisible();
    expect(within(detalhe).getByText('17/05/1990')).toBeVisible();
    expect(within(detalhe).getByText('Feminino')).toBeVisible();
    expect(within(detalhe).getByText('Aceita')).toBeVisible();
    for (const nome of ['Histórico', 'Editar']) {
      expect(within(detalhe).getByRole('button', { name: nome })).toBeVisible();
    }
    const fechar = within(detalhe).getAllByRole('button', { name: 'Fechar' });
    await user.click(fechar[0] as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('detalhe de pessoa jurídica mostra CNPJ e representante', async () => {
    const { user } = renderTela(
      api({
        rotas: {
          [API]: () =>
            pagina([
              paciente({
                ...PACIENTES[1],
                razaoSocial: 'Empresa LTDA',
                representanteNome: 'Fulano',
              }),
            ]),
        },
      }),
    );

    await user.click(await screen.findByText('Empresa Teste'));

    const detalhe = await screen.findByRole('dialog', { name: 'Empresa Teste' });
    expect(within(detalhe).getByText('CNPJ')).toBeVisible();
    expect(within(detalhe).getByText('Empresa LTDA')).toBeVisible();
    expect(within(detalhe).getByText('Fulano')).toBeVisible();
  });

  it('Novo Paciente: salvar vazio mostra "O nome do paciente é obrigatório." e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Paciente' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Paciente' });
    expect(within(modal).getByRole('radio', { name: 'Pessoa Física' })).toBeChecked();
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('O nome do paciente é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Novo Paciente: trocar para Pessoa Jurídica mostra os campos da empresa', async () => {
    const { user } = renderTela();
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Paciente' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Paciente' });
    expect(within(modal).getByLabelText('CPF')).toBeVisible();
    expect(within(modal).queryByLabelText('Razão Social')).not.toBeInTheDocument();

    await user.click(within(modal).getByRole('radio', { name: 'Pessoa Jurídica' }));

    expect(within(modal).getByLabelText('CNPJ')).toBeVisible();
    for (const rotulo of [
      'Razão Social',
      'Nome Fantasia',
      'Inscrição Estadual',
      'Data de Fundação',
    ]) {
      expect(within(modal).getByLabelText(rotulo)).toBeVisible();
    }
    expect(within(modal).getByText('Representante Legal')).toBeVisible();
    expect(within(modal).queryByLabelText('RG')).not.toBeInTheDocument();
  });

  it('Novo Paciente: CPF inválido mostra o erro; salvar envia o corpo, fecha e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(PACIENTES);
          corpo = corpoDe(init);
          return json(paciente({ id: '00000000-0000-4000-8000-0000000000b3', nome: 'Nova' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Paciente' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Paciente' });
    await user.type(within(modal).getByPlaceholderText('Nome completo'), 'Nova');
    await user.type(within(modal).getByLabelText('CPF'), '11111111111');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));
    expect(await within(modal).findByText('CPF inválido')).toBeVisible();

    await user.clear(within(modal).getByLabelText('CPF'));
    await user.type(within(modal).getByLabelText('CPF'), '52998224725');
    await marcarConsentimentos(modal, user);
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      tipo: 'PF',
      nome: 'Nova',
      documento: '52998224725',
      status: 'ATIVO',
    });
    expect(corpo.consentimentos).toEqual([
      { tipo: 'TRATAMENTO_DADOS', aceito: true, canal: 'PRESENCIAL', observacao: null },
      { tipo: 'COMUNICACAO', aceito: true, canal: 'PRESENCIAL', observacao: null },
      { tipo: 'CAMPANHAS', aceito: true, canal: 'PRESENCIAL', observacao: null },
    ]);
    expect(
      chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET'),
    ).toHaveLength(2);
  });

  it('Novo Paciente: CPF repetido mostra o erro do servidor no campo', async () => {
    const { user } = renderTela(
      api({
        rotas: {
          [API]: (init) =>
            init?.method === 'POST'
              ? json(
                  {
                    statusCode: 409,
                    code: 'PACIENTE_DOCUMENTO_DUPLICADO',
                    message: 'Já existe um cadastro com este CPF (Pessoa Física).',
                    details: [{ field: 'documento', message: 'CPF já cadastrado' }],
                  },
                  409,
                )
              : pagina(PACIENTES),
        },
      }),
    );
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Paciente' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Paciente' });
    await user.type(within(modal).getByPlaceholderText('Nome completo'), 'Outra');
    await marcarConsentimentos(modal, user);
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText(/já existe um cadastro com este cpf/i)).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Novo Paciente' })).toBeVisible();
  });

  it('Editar pelo menu da linha: abre preenchido e envia PATCH', async () => {
    let corpo: Corpo = {};
    let metodo = '';
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_1}`]: (init) => {
          metodo = String(init?.method);
          corpo = corpoDe(init);
          return json(paciente({ nome: 'Ana Souza' }));
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getAllByRole('button', { name: 'Ações' })[0] as HTMLElement);
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Paciente' });
    const nome = within(modal).getByPlaceholderText('Nome completo');
    expect(nome).toHaveValue('Ana Teste');
    await user.clear(nome);
    await user.type(nome, 'Ana Souza');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(metodo).toBe('PATCH');
    expect(corpo).toMatchObject({ nome: 'Ana Souza', documento: '52998224725', status: 'NOVO' });
  });

  it('Editar pelo detalhe abre o formulário', async () => {
    const { user } = renderTela();

    await user.click(await screen.findByText('Ana Teste'));
    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    expect(await screen.findByRole('dialog', { name: 'Editar Paciente' })).toBeVisible();
  });

  it('Excluir pede confirmação e chama DELETE', async () => {
    let metodo = '';
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_1}`]: (init) => {
          metodo = String(init?.method);
          return json(paciente({}));
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getAllByRole('button', { name: 'Ações' })[0] as HTMLElement);
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(metodo).toBe('');
    await user.click(within(confirmacao).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(metodo).toBe('DELETE'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('Histórico lista as alterações do audit_log com os campos alterados', async () => {
    const item: AuditLogItem = {
      id: '00000000-0000-4000-8000-0000000000d1',
      userId: USUARIO_TESTE.id,
      occurredAt: AGORA,
      action: 'UPDATE',
      entity: 'Paciente',
      entityId: ID_1,
      before: { nome: 'Ana Teste', cidade: null, updatedAt: 'a' },
      after: { nome: 'Ana Souza', cidade: null, updatedAt: 'b' },
      userNome: null,
      campos: ['nome'],
      restrito: false,
      requestId: null,
      ip: null,
    };
    const fetchMock = api({
      rotas: {
        '/api/auditoria': () =>
          json({ data: [item], meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }),
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getAllByRole('button', { name: 'Ações' })[0] as HTMLElement);
    await user.click(await screen.findByRole('menuitem', { name: 'Histórico' }));

    const modal = await screen.findByRole('dialog', { name: 'Histórico de Ana Teste' });
    expect(await within(modal).findByText('Alteração')).toBeVisible();
    expect(within(modal).getByText('Campos: nome')).toBeVisible();
    const [url] = chamadasPara(fetchMock, '/api/auditoria')[0] ?? [''];
    expect(Object.fromEntries(new URL(url, 'http://x').searchParams)).toMatchObject({
      entity: 'Paciente',
      entityId: ID_1,
    });
  });

  it('sem permissões de escrita, esconde Novo Paciente, Editar e Excluir', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: PERMISSOES.filter((p) => p === 'comercial-atendimento.pacientes.ver'),
    };
    const { user } = renderTela(api({ usuario }));
    await screen.findByText('Ana Teste');

    expect(screen.queryByRole('button', { name: 'Novo Paciente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar Excel' })).not.toBeInTheDocument();
    await user.click(await screen.findByText('Ana Teste'));
    const detalhe = await screen.findByRole('dialog', { name: 'Ana Teste' });
    expect(within(detalhe).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(within(detalhe).queryByRole('button', { name: 'Histórico' })).not.toBeInTheDocument();
  });

  it('Exportar Excel baixa com os filtros atuais', async () => {
    const fetchMock = api({
      rotas: {
        [`${API}/export`]: () =>
          new Response('x', {
            headers: { 'Content-Type': 'application/octet-stream' },
          }),
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');
    const original = { criar: URL.createObjectURL, revogar: URL.revokeObjectURL };
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => undefined;

    await user.click(screen.getByRole('button', { name: 'Exportar Excel' }));

    await waitFor(() => expect(chamadasPara(fetchMock, `${API}/export`)).toHaveLength(1));
    const [url] = chamadasPara(fetchMock, `${API}/export`)[0] ?? [''];
    expect(new URL(url, 'http://x').searchParams.get('format')).toBe('xlsx');
    URL.createObjectURL = original.criar;
    URL.revokeObjectURL = original.revogar;
  });
});

describe('Pacientes: relacionamento e consentimentos (#148)', () => {
  const DETALHADO = paciente({
    canalOrigem: 'WHATSAPP',
    preferenciaComunicacao: 'EMAIL',
    whatsapp: '65988880001',
    indicacaoTipo: 'PROFISSIONAL',
    indicacaoReferenciaId: ID_2,
    indicacaoNome: 'Dr. Indicador',
    profissionalVinculoId: ID_2,
    profissionalVinculoNome: 'Dra. Vínculo',
    especialidadeVinculoId: ORIGEM,
    especialidadeVinculoNome: 'Nutrologia',
    primeiroAtendimento: '2026-01-10T13:00:00.000Z',
    ultimoAtendimento: '2026-08-20T13:00:00.000Z',
    proximoRetorno: '2027-01-05T13:00:00.000Z',
    faltas: 2,
  });

  function apiDetalhe(
    historico: () => Consentimento[],
    extra: NonNullable<Parameters<typeof apiFalsa>[0]>['rotas'] = {},
  ) {
    return api({
      rotas: {
        [API]: () => pagina([DETALHADO]),
        [`${API}/${ID_1}/consentimentos`]: (init) =>
          init?.method === 'POST'
            ? json(consentimento({ aceito: false, canal: 'WHATSAPP' }), 201)
            : json({ data: historico() }),
        ...extra,
      },
    });
  }

  it('colunas de relacionamento começam ocultas e o botão Colunas as mostra', async () => {
    const { user } = renderTela(apiDetalhe(() => []));
    await screen.findByText('Ana Teste');
    expect(screen.queryByRole('columnheader', { name: 'Faltas' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /colunas/i }));
    for (const nome of ['Canal de origem', 'Último atendimento', 'Próximo retorno', 'Faltas']) {
      await user.click(await screen.findByRole('menuitemcheckbox', { name: nome }));
    }
    await user.keyboard('{Escape}');

    expect(await screen.findByRole('columnheader', { name: 'Faltas' })).toBeVisible();
    const linha = screen.getByText('Ana Teste').closest('tr') as HTMLElement;
    // A origem da linha também se chama WhatsApp: a célula nova é a segunda.
    expect(within(linha).getAllByText('WhatsApp')).toHaveLength(2);
    expect(within(linha).getByText('20/08/2026')).toBeVisible();
    expect(within(linha).getByText('2')).toBeVisible();
  });

  it('filtros: origem, canal, sem retorno, com faltas e novos no período vão para a API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await escolher(user, screen.getByRole('combobox', { name: 'Canal de origem' }), 'WhatsApp');
    await waitFor(() => expect(consulta(fetchMock)).toMatchObject({ canalOrigem: 'WHATSAPP' }));

    await escolher(
      user,
      screen.getByRole('combobox', { name: 'Sem retorno há…' }),
      'Mais de 90 dias',
    );
    await waitFor(() => expect(consulta(fetchMock)).toMatchObject({ semRetornoDias: '90' }));

    await user.click(screen.getByRole('checkbox', { name: 'Com faltas' }));
    await waitFor(() => expect(consulta(fetchMock)).toMatchObject({ comFaltas: 'true' }));

    await user.type(screen.getByLabelText('Novos no período de:'), '2026-11-01');
    await waitFor(() => expect(consulta(fetchMock)).toMatchObject({ novosDe: '2026-11-01' }));
    expect(consulta(fetchMock)).toMatchObject({ canalOrigem: 'WHATSAPP', semRetornoDias: '90' });
  });

  it('detalhe mostra relacionamento, atendimento e retorno, e o histórico de consentimentos', async () => {
    const historico = [
      consentimento({
        id: idConsentimento(3),
        aceito: false,
        canal: 'WHATSAPP',
        observacao: 'Pediu para parar',
      }),
      consentimento({ id: idConsentimento(2), tipo: 'COMUNICACAO', aceito: true }),
      consentimento({ id: idConsentimento(1), aceito: true }),
    ];
    const { user } = renderTela(apiDetalhe(() => historico));

    await user.click(await screen.findByText('Ana Teste'));

    const detalhe = await screen.findByRole('dialog', { name: 'Ana Teste' });
    expect(within(detalhe).getByText('Profissional do Torres: Dr. Indicador')).toBeVisible();
    expect(within(detalhe).getByText('Dra. Vínculo')).toBeVisible();
    expect(within(detalhe).getByText('Nutrologia')).toBeVisible();
    expect(within(detalhe).getByText('(65) 98888-0001')).toBeVisible();
    expect(within(detalhe).getByText('10/01/2026')).toBeVisible();
    expect(within(detalhe).getByText('20/08/2026')).toBeVisible();
    expect(within(detalhe).getByText('Próximo retorno agendado')).toBeVisible();

    const itens = await within(detalhe).findAllByTestId('consentimento-historico');
    expect(itens).toHaveLength(3);
    expect(within(itens[0] as HTMLElement).getByText('Recusado')).toBeVisible();
    expect(within(itens[0] as HTMLElement).getByText('Pediu para parar')).toBeVisible();
    expect(within(detalhe).getByText('Sem registro')).toBeVisible();
  });

  it('registrar revogação envia o POST e recarrega o histórico', async () => {
    let historico: Consentimento[] = [consentimento({ id: idConsentimento(1), aceito: true })];
    let corpo: Corpo = {};
    const fetchMock = apiDetalhe(() => historico, {
      [`${API}/${ID_1}/consentimentos`]: (init) => {
        if (init?.method !== 'POST') return json({ data: historico });
        corpo = corpoDe(init);
        historico = [
          consentimento({ id: idConsentimento(2), aceito: false, canal: 'WHATSAPP' }),
          ...historico,
        ];
        return json(historico[0], 201);
      },
    });
    const { user } = renderTela(fetchMock);
    await user.click(await screen.findByText('Ana Teste'));
    const detalhe = await screen.findByRole('dialog', { name: 'Ana Teste' });
    await within(detalhe).findAllByTestId('consentimento-historico');

    await escolher(user, within(detalhe).getByRole('combobox', { name: 'Canal' }), 'WhatsApp');
    await user.click(within(detalhe).getByRole('switch', { name: 'Aceito' }));
    await user.click(within(detalhe).getByRole('button', { name: 'Registrar' }));

    await waitFor(() =>
      expect(corpo).toMatchObject({ tipo: 'CAMPANHAS', aceito: false, canal: 'WHATSAPP' }),
    );
    await waitFor(() =>
      expect(within(detalhe).getAllByTestId('consentimento-historico')).toHaveLength(2),
    );
  });

  it('sem a permissão de editar, o detalhe só lista os consentimentos', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: ['comercial-atendimento.pacientes.ver'] as typeof USUARIO_TESTE.permissoes,
    };
    const fetchMock = apiFalsa({
      usuario,
      rotas: {
        [API]: () => pagina([DETALHADO]),
        [`${API}/${ID_1}/consentimentos`]: () => json({ data: [consentimento({})] }),
      },
    });
    const { user } = renderTela(fetchMock, usuario);

    await user.click(await screen.findByText('Ana Teste'));

    const detalhe = await screen.findByRole('dialog', { name: 'Ana Teste' });
    await within(detalhe).findAllByTestId('consentimento-historico');
    expect(within(detalhe).queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument();
  });

  it('Novo Paciente: sem escolher os consentimentos não cadastra e mostra o que falta', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Paciente' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Paciente' });
    await user.type(within(modal).getByPlaceholderText('Nome completo'), 'Nova');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(
      await within(modal).findAllByText('Informe se o paciente aceitou ou recusou.'),
    ).toHaveLength(3);
    expect(within(modal).getByText('Informe onde foi dado o consentimento.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Novo Paciente: envia relacionamento (canal, WhatsApp, indicação por texto, preferência)', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (init?.method !== 'POST') return pagina(PACIENTES);
          corpo = corpoDe(init);
          return json(paciente({ id: '00000000-0000-4000-8000-0000000000b3' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Paciente' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Paciente' });
    await user.type(within(modal).getByPlaceholderText('Nome completo'), 'Nova');
    await escolher(
      user,
      within(modal).getByRole('combobox', { name: 'Canal de origem' }),
      'Redes sociais',
    );
    await escolher(
      user,
      within(modal).getByRole('combobox', { name: 'Preferência de comunicação' }),
      'WhatsApp',
    );
    await user.type(within(modal).getByLabelText('WhatsApp'), '65988880001');
    await escolher(
      user,
      within(modal).getByRole('combobox', { name: 'Quem indicou' }),
      'Outra pessoa (texto livre)',
    );
    await user.type(within(modal).getByLabelText(/Nome de quem indicou/), 'Vizinha da clínica');
    await marcarConsentimentos(modal, user, 'Recusado');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      canalOrigem: 'REDES_SOCIAIS',
      preferenciaComunicacao: 'WHATSAPP',
      whatsapp: '65988880001',
      indicacaoTipo: 'TEXTO',
      indicacaoTexto: 'Vizinha da clínica',
    });
    expect(corpo.consentimentos).toHaveLength(3);
    expect(corpo.consentimentos).toEqual(
      expect.arrayContaining([expect.objectContaining({ tipo: 'CAMPANHAS', aceito: false })]),
    );
  });

  it('Novo Paciente: indicação por texto sem o nome mostra o erro de obrigatório', async () => {
    const { user } = renderTela();
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Paciente' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Paciente' });
    await user.type(within(modal).getByPlaceholderText('Nome completo'), 'Nova');
    await escolher(
      user,
      within(modal).getByRole('combobox', { name: 'Quem indicou' }),
      'Outra pessoa (texto livre)',
    );
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('Quem indicou é obrigatório.')).toBeVisible();
  });

  it('Editar: não pede consentimentos, avisa onde alterar e não envia o campo', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_1}`]: (init) => {
          corpo = corpoDe(init);
          return json(paciente({}));
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getAllByRole('button', { name: 'Ações' })[0] as HTMLElement);
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Paciente' });
    expect(
      within(modal).getByText(
        'Para registrar ou revogar um consentimento, abra o detalhe do paciente.',
      ),
    ).toBeVisible();
    expect(within(modal).queryByRole('radiogroup', { name: 'Campanhas' })).not.toBeInTheDocument();
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).not.toHaveProperty('consentimentos');
    expect(corpo).not.toHaveProperty('aceitaCampanhasWhatsapp');
  });

  it.each([
    ['en', 'Last visit', 'No-shows', 'Consents (LGPD)', 'Accepted'],
    ['es', 'Última atención', 'Inasistencias', 'Consentimientos (LGPD)', 'Aceptado'],
  ] as const)(
    'em %s, traduz colunas, filtros e consentimentos do detalhe',
    async (idioma, ultimo, faltas, titulo, aceito) => {
      const usuario = {
        ...USUARIO_TESTE,
        preferencias: { ...PREFERENCIAS_PADRAO, idioma },
      };
      const fetchMock = apiFalsa({
        usuario,
        rotas: {
          [API]: () => pagina([DETALHADO]),
          [`${API}/${ID_1}/consentimentos`]: () => json({ data: [consentimento({})] }),
        },
      });
      const { user } = renderTela(fetchMock, usuario);
      await screen.findByText('Ana Teste');

      await user.click(screen.getByRole('button', { name: /columns|columnas/i }));
      expect(await screen.findByRole('menuitemcheckbox', { name: ultimo })).toBeVisible();
      expect(screen.getByRole('menuitemcheckbox', { name: faltas })).toBeVisible();
      await user.keyboard('{Escape}');

      await user.click(screen.getByText('Ana Teste'));
      const detalhe = await screen.findByRole('dialog', { name: 'Ana Teste' });
      expect(await within(detalhe).findByText(titulo)).toBeVisible();
      expect((await within(detalhe).findAllByText(aceito)).length).toBeGreaterThan(0);
    },
  );
});

describe('formatadores', () => {
  it('iniciaisDe: primeira e última palavra; "-" sem nome', () => {
    expect(iniciaisDe('Maria da Silva')).toBe('MS');
    expect(iniciaisDe('Maria')).toBe('M');
    expect(iniciaisDe('')).toBe('-');
  });

  it('formatarData: DD/MM/AAAA sem mudar o dia', () => {
    expect(formatarData('1990-05-17')).toBe('17/05/1990');
    expect(formatarData(null)).toBe('-');
  });

  it('camposAlterados: só os campos que mudaram, sem datas de controle', () => {
    const item = {
      before: { nome: 'A', cidade: null, updatedAt: '1' },
      after: { nome: 'B', cidade: null, updatedAt: '2' },
    } as AuditLogItem;
    expect(camposAlterados(item)).toEqual(['nome']);
    expect(camposAlterados({ before: null, after: null } as AuditLogItem)).toEqual([]);
  });
});
