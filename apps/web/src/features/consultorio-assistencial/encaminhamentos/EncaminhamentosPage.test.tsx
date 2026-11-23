import {
  PERMISSOES,
  PREFERENCIAS_PADRAO,
  type Encaminhamento,
  type EncaminhamentoRelatorioLinha,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/consultorio-assistencial/encaminhamentos';
const PROFISSIONAIS = `${API}/profissionais`;
const RELATORIO = `${API}/relatorio`;
const ID_1 = '00000000-0000-4000-8000-0000000000e1';
const ID_2 = '00000000-0000-4000-8000-0000000000e2';
const PACIENTE = '00000000-0000-4000-8000-0000000000a1';
const ORIGEM = '00000000-0000-4000-8000-0000000000b1';
const DESTINO = '00000000-0000-4000-8000-0000000000b2';
const META = { page: 1, pageSize: 10, total: 2, totalPages: 1 };

function encaminhamento(parcial: Partial<Encaminhamento> = {}): Encaminhamento {
  return {
    id: ID_1,
    pacienteId: PACIENTE,
    pacienteNome: 'Paciente Teste',
    origemProfissionalId: ORIGEM,
    origemProfissionalNome: 'Dr. Origem',
    destinoProfissionalId: DESTINO,
    destinoProfissionalNome: 'Dra. Destino',
    especialidadeId: null,
    especialidadeNome: 'Cardiologia',
    data: '2026-11-10',
    motivo: 'Avaliação',
    situacao: 'ENCAMINHADO',
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-10T12:00:00.000Z',
    ...parcial,
  };
}

const LISTA = [
  encaminhamento(),
  encaminhamento({
    id: ID_2,
    pacienteNome: 'Paciente Dois',
    especialidadeNome: null,
    data: '2026-11-05',
    situacao: 'ATENDIDO',
  }),
];

const LINHAS: EncaminhamentoRelatorioLinha[] = [
  {
    profissionalId: ORIGEM,
    profissionalNome: 'Dr. Origem',
    enviados: 4,
    enviadosAtendidos: 3,
    taxaEnviados: 75,
    recebidos: 1,
    recebidosAtendidos: 0,
    taxaRecebidos: 0,
  },
  {
    profissionalId: DESTINO,
    profissionalNome: 'Dra. Destino',
    enviados: 0,
    enviadosAtendidos: 0,
    taxaEnviados: 0,
    recebidos: 3,
    recebidosAtendidos: 1,
    taxaRecebidos: 33.3,
  },
];

type Corpo = Record<string, unknown>;
type Usuario = ReturnType<typeof userEvent.setup>;

const pagina = (data: unknown[]) => json({ data, meta: { ...META, total: data.length } });
const corpoDe = (init?: RequestInit): Corpo => JSON.parse(String(init?.body)) as Corpo;
const lookup = (data: { id: string; label: string }[]) =>
  json({ data: data.map((d) => ({ ...d, descricao: null })), meta: META });

function api(extra: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...extra,
    rotas: {
      [API]: () => pagina(LISTA),
      [PROFISSIONAIS]: () =>
        json({
          origens: [{ id: ORIGEM, label: 'Dr. Origem', descricao: null }],
          destinos: [
            { id: ORIGEM, label: 'Dr. Origem', descricao: null },
            { id: DESTINO, label: 'Dra. Destino', descricao: null },
          ],
        }),
      [RELATORIO]: () => pagina(LINHAS),
      '/api/lookups/pacientes': () => lookup([{ id: PACIENTE, label: 'Paciente Teste' }]),
      '/api/lookups/especialidades': () => lookup([]),
      ...extra.rotas,
    },
  });
}

function renderTela(fetchMock = api(), caminho = '/encaminhamentos') {
  return { user: userEvent.setup(), ...renderApp(caminho, fetchMock), fetchMock };
}

const cabecalhos = () =>
  within(screen.getByRole('table'))
    .getAllByRole('columnheader')
    .map((c) => c.textContent);

const posts = (fetchMock: ReturnType<typeof apiFalsa>) =>
  chamadasPara(fetchMock, API).filter(([, init]) => init?.method === 'POST');

const chamou = (fetchMock: ReturnType<typeof apiFalsa>, url: string, trecho: string) =>
  chamadasPara(fetchMock, url).some(([chamada]) => chamada.includes(trecho));

async function abrirMenu(user: Usuario, linha: string, item: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

async function abrirNovo(user: Usuario) {
  await screen.findByText('Paciente Teste');
  await user.click(screen.getByRole('button', { name: 'Novo Encaminhamento' }));
  return screen.findByRole('dialog', { name: 'Novo Encaminhamento' });
}

async function escolher(user: Usuario, modal: HTMLElement, campo: RegExp, opcao: string | RegExp) {
  await user.click(within(modal).getByRole('combobox', { name: campo }));
  await user.click(await screen.findByRole('option', { name: opcao }));
}

describe('Encaminhamentos (/encaminhamentos)', () => {
  it('mostra título, abas, ações, busca, chips de situação e as colunas', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Encaminhamentos' })).toBeVisible();
    expect(
      screen.getByText('Pacientes encaminhados entre profissionais do ecossistema Torres.'),
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Encaminhamentos', selected: true })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Relatório por Profissional' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Encaminhamento' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByPlaceholderText('Buscar encaminhamentos...')).toBeVisible();
    for (const chip of ['Todos', 'Encaminhado', 'Agendado', 'Atendido']) {
      expect(screen.getByRole('button', { name: chip })).toBeVisible();
    }
    await screen.findByText('Paciente Teste');
    expect(cabecalhos()).toEqual([
      'Data',
      'Paciente',
      'Encaminhado por',
      'Encaminhado para',
      'Especialidade',
      'Situação',
      'Ações',
    ]);
  });

  it('mostra datas, profissionais, situação pelo rótulo e "-" nos vazios', async () => {
    renderTela();

    const primeira = (await screen.findByText('Paciente Teste')).closest('tr') as HTMLElement;
    for (const texto of [
      '10/11/2026',
      'Dr. Origem',
      'Dra. Destino',
      'Cardiologia',
      'Encaminhado',
    ]) {
      expect(within(primeira).getByText(texto)).toBeVisible();
    }
    const segunda = screen.getByText('Paciente Dois').closest('tr') as HTMLElement;
    expect(within(segunda).getByText('Atendido')).toBeVisible();
    expect(within(segunda).getByText('-')).toBeVisible();
  });

  it('mostra o estado vazio', async () => {
    renderTela(api({ rotas: { [API]: () => pagina([]) } }));
    expect(await screen.findByText('Nenhum encaminhamento encontrado.')).toBeVisible();
  });

  it('a busca e o chip de situação enviam search e situacao para a API', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Paciente Teste');

    await user.type(screen.getByPlaceholderText('Buscar encaminhamentos...'), 'cardio');
    await waitFor(() => expect(chamou(fetchMock, API, 'search=cardio')).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Agendado' }));
    await waitFor(() => expect(chamou(fetchMock, API, 'situacao=AGENDADO')).toBe(true));
  });

  it('ordena por cada coluna e pagina', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Paciente Teste');

    for (const [coluna, campo] of [
      ['Data', 'data'],
      ['Paciente', 'paciente'],
      ['Encaminhado por', 'origem'],
      ['Encaminhado para', 'destino'],
      ['Especialidade', 'especialidade'],
      ['Situação', 'situacao'],
    ] as const) {
      await user.click(within(screen.getByRole('table')).getByRole('button', { name: coluna }));
      await waitFor(() => expect(chamou(fetchMock, API, `sort=${campo}`)).toBe(true));
    }
  });

  it('Novo Encaminhamento: campos, asterisco nos obrigatórios e só profissionais selecionáveis', async () => {
    const { user } = renderTela();
    const modal = await abrirNovo(user);

    expect(within(modal).getByLabelText('Motivo')).toBeVisible();
    expect(within(modal).getByLabelText('Data')).toHaveValue(
      new Date().toLocaleDateString('en-CA'),
    );
    expect(within(modal).getByRole('combobox', { name: /Paciente/ })).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: /Especialidade/ })).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: /Profissional de origem/ })).toBeVisible();
    expect(
      within(modal).getByText(/O profissional de destino não vê conteúdo clínico/),
    ).toBeVisible();

    await user.click(within(modal).getByRole('combobox', { name: /Profissional de destino/ }));
    const opcoes = await screen.findAllByRole('option');
    expect(opcoes.map((o) => o.textContent)).toEqual(['Dr. Origem', 'Dra. Destino']);
  });

  it('vazio mostra as mensagens de obrigatório e não envia', async () => {
    const { user, fetchMock } = renderTela();
    const modal = await abrirNovo(user);

    await user.click(within(modal).getByRole('button', { name: 'Registrar' }));

    expect(await within(modal).findByText('Paciente é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Profissional de origem é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Profissional de destino é obrigatório.')).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('origem igual ao destino mostra a mensagem e não envia', async () => {
    const { user, fetchMock } = renderTela();
    const modal = await abrirNovo(user);

    await escolher(user, modal, /Paciente/, /Paciente Teste/);
    await escolher(user, modal, /Profissional de origem/, 'Dr. Origem');
    await escolher(user, modal, /Profissional de destino/, 'Dr. Origem');
    await user.click(within(modal).getByRole('button', { name: 'Registrar' }));

    expect(
      await within(modal).findByText('Origem e destino devem ser profissionais diferentes'),
    ).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('registra: envia o corpo, fecha o modal e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const { user, fetchMock } = renderTela(
      api({
        rotas: {
          [API]: (init) => {
            if (init?.method !== 'POST') return pagina(LISTA);
            corpo = corpoDe(init);
            return json(encaminhamento(), 201);
          },
        },
      }),
    );
    const modal = await abrirNovo(user);

    await escolher(user, modal, /Paciente/, /Paciente Teste/);
    await escolher(user, modal, /Profissional de origem/, 'Dr. Origem');
    await escolher(user, modal, /Profissional de destino/, 'Dra. Destino');
    await user.type(within(modal).getByLabelText('Motivo'), 'Avaliação cardiológica');
    await user.click(within(modal).getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      pacienteId: PACIENTE,
      origemProfissionalId: ORIGEM,
      destinoProfissionalId: DESTINO,
      especialidadeId: null,
      data: new Date().toLocaleDateString('en-CA'),
      motivo: 'Avaliação cardiológica',
    });
    await waitFor(() =>
      expect(
        chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET').length,
      ).toBeGreaterThan(1),
    );
  });

  it('erro de negócio do servidor aparece no formulário (destino sem indicação)', async () => {
    const { user } = renderTela(
      api({
        rotas: {
          [API]: (init) =>
            init?.method === 'POST'
              ? json(
                  {
                    statusCode: 422,
                    code: 'DESTINO_SEM_INDICACAO',
                    message:
                      'O profissional de destino não tem contrato ativo que permita indicação de pacientes',
                  },
                  422,
                )
              : pagina(LISTA),
        },
      }),
    );
    const modal = await abrirNovo(user);

    await escolher(user, modal, /Paciente/, /Paciente Teste/);
    await escolher(user, modal, /Profissional de origem/, 'Dr. Origem');
    await escolher(user, modal, /Profissional de destino/, 'Dra. Destino');
    await user.click(within(modal).getByRole('button', { name: 'Registrar' }));

    expect(
      await within(modal).findByText(/não tem contrato ativo que permita indicação/),
    ).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('Cancelar fecha o modal sem enviar', async () => {
    const { user, fetchMock } = renderTela();
    const modal = await abrirNovo(user);

    await user.click(within(modal).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('Editar abre com os dados e envia PATCH com Salvar', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: (init) => {
            corpo = corpoDe(init);
            return json(encaminhamento());
          },
        },
      }),
    );

    await abrirMenu(user, 'Paciente Teste', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Encaminhamento' });
    expect(within(modal).getByLabelText('Data')).toHaveValue('2026-11-10');
    const motivo = within(modal).getByLabelText('Motivo');
    expect(motivo).toHaveValue('Avaliação');
    await user.clear(motivo);
    await user.type(motivo, 'Novo motivo');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      pacienteId: PACIENTE,
      origemProfissionalId: ORIGEM,
      destinoProfissionalId: DESTINO,
      data: '2026-11-10',
      motivo: 'Novo motivo',
    });
  });

  it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
    let excluidos = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluidos += 1;
            return json(encaminhamento());
          },
        },
      }),
    );

    await abrirMenu(user, 'Paciente Teste', 'Excluir');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Encaminhamento' });
    expect(dialogo).toHaveTextContent(
      'Tem certeza que deseja excluir o encaminhamento de "Paciente Teste"? Esta ação não pode ser desfeita.',
    );
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidos).toBe(0);

    await abrirMenu(user, 'Paciente Teste', 'Excluir');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidos).toBe(1));
  });

  it('aba Relatório: colunas, valores, percentuais e ordenação', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Paciente Teste');

    await user.click(screen.getByRole('tab', { name: 'Relatório por Profissional' }));

    await screen.findByText('Dra. Destino');
    expect(cabecalhos()).toEqual([
      'Profissional',
      'Enviados',
      'Enviados atendidos',
      'Conversão (enviados)',
      'Recebidos',
      'Recebidos atendidos',
      'Conversão (recebidos)',
    ]);
    const origem = screen.getByText('Dr. Origem').closest('tr') as HTMLElement;
    expect(within(origem).getByText('75%')).toBeVisible();
    const destino = screen.getByText('Dra. Destino').closest('tr') as HTMLElement;
    expect(within(destino).getByText('33,3%')).toBeVisible();
    expect(screen.queryByPlaceholderText('Buscar encaminhamentos...')).not.toBeInTheDocument();

    await user.click(within(screen.getByRole('table')).getByRole('button', { name: 'Recebidos' }));
    await waitFor(() => expect(chamou(fetchMock, RELATORIO, 'sort=recebidos')).toBe(true));
  });

  it('a aba fica na URL e voltar para a lista descarta os filtros do relatório', async () => {
    const { router, user } = renderTela(api(), '/encaminhamentos?aba=relatorio');

    await screen.findByText('Dra. Destino');
    expect(
      screen.getByRole('tab', { name: 'Relatório por Profissional', selected: true }),
    ).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Encaminhamentos' }));

    await screen.findByText('Paciente Teste');
    expect(router.state.location.search).toBe('');
  });

  it('sem permissão de criar, editar, excluir e exportar, esconde os botões e as ações', async () => {
    const somenteVer = PERMISSOES.filter(
      (p) => p === 'consultorio-assistencial.encaminhamentos.ver',
    );
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Paciente Teste');

    expect(screen.queryByRole('button', { name: 'Novo Encaminhamento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ações' })).not.toBeInTheDocument();
  });

  it('em inglês: textos da tela, do modal e da validação traduzidos', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    const fetchMock = api({ usuario });
    const { user } = renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Referrals' })).toBeVisible();
    await screen.findByText('Paciente Teste');
    expect(cabecalhos()).toEqual([
      'Date',
      'Patient',
      'Referred by',
      'Referred to',
      'Specialty',
      'Status',
      'Actions',
    ]);
    expect(within(screen.getByRole('table')).getByText('Seen')).toBeVisible();
    expect(screen.getByPlaceholderText('Search referrals...')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Report by Professional' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'New Referral' }));
    const modal = await screen.findByRole('dialog', { name: 'New Referral' });
    await user.click(within(modal).getByRole('button', { name: 'Register' }));

    expect(await within(modal).findByText('Patient is required.')).toBeVisible();
    expect(within(modal).getByText('Referring professional is required.')).toBeVisible();
    expect(within(modal).getByText('Receiving professional is required.')).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('em espanhol traduz o título, as colunas e a situação', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'es' as const },
    };
    renderTela(api({ usuario }));

    expect(await screen.findByRole('heading', { name: 'Derivaciones' })).toBeVisible();
    await screen.findByText('Paciente Teste');
    expect(cabecalhos().slice(0, 3)).toEqual(['Fecha', 'Paciente', 'Derivado por']);
    expect(within(screen.getByRole('table')).getByText('Atendido')).toBeVisible();
  });
});
