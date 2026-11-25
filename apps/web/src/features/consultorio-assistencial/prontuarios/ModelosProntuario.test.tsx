import type { Atendimento, ModeloProntuario, PacienteResumoProntuario } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aplicarIdioma } from '@/lib/i18n';
import { PREFERENCIAS_PADRAO } from '@torres/shared';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 30_000 });

const API = '/api/consultorio-assistencial/prontuarios';
const API_MODELOS = '/api/consultorio-assistencial/modelos-prontuario';
const ID_PACIENTE = '00000000-0000-4000-8000-0000000000b1';
const ID_PROFISSIONAL = '00000000-0000-4000-8000-0000000000a1';
const ID_MODELO = '00000000-0000-4000-8000-0000000000f1';
const ID_VERSAO = '00000000-0000-4000-8000-0000000000f2';
const ID_ATENDIMENTO = '00000000-0000-4000-8000-0000000000c1';

const PACIENTE: PacienteResumoProntuario = {
  id: ID_PACIENTE,
  nome: 'Paciente Fictício',
  email: null,
  documento: null,
  telefone: null,
  celular: null,
  dataNascimento: null,
  sexo: null,
};

const SECOES: ModeloProntuario['secoes'] = [
  {
    titulo: 'Avaliação',
    campos: [
      {
        chave: 'queixa',
        rotulo: 'Queixa principal',
        tipo: 'TEXTO',
        obrigatorio: true,
        opcoes: null,
        min: null,
        max: null,
      },
      {
        chave: 'humor',
        rotulo: 'Humor',
        tipo: 'ESCALA',
        obrigatorio: false,
        opcoes: null,
        min: 0,
        max: 10,
      },
    ],
  },
];

const MODELO: ModeloProntuario = {
  id: ID_MODELO,
  nome: 'Anamnese psicológica',
  profissao: 'PSICOLOGO',
  especialidade: 'Psicologia infantil',
  profissionalId: null,
  profissionalNome: null,
  padrao: true,
  ativo: true,
  versao: 2,
  secoes: SECOES,
  createdAt: '2026-11-25T10:00:00.000Z',
  updatedAt: '2026-11-25T10:00:00.000Z',
};

const PROPRIO: ModeloProntuario = {
  ...MODELO,
  id: '00000000-0000-4000-8000-0000000000f3',
  nome: 'Avaliação nutricional',
  profissao: 'NUTRICIONISTA',
  especialidade: null,
  profissionalId: ID_PROFISSIONAL,
  profissionalNome: 'Dra. Ana Teste',
  padrao: false,
  versao: 1,
};

const ATENDIMENTO_COM_MODELO: Atendimento = {
  id: ID_ATENDIMENTO,
  pacienteId: ID_PACIENTE,
  profissionalId: ID_PROFISSIONAL,
  profissionalNome: 'Dra. Ana Teste',
  tipo: 'CONSULTA',
  queixa: null,
  evolucao: null,
  diagnostico: null,
  conduta: null,
  observacoes: null,
  status: 'EM_ANDAMENTO',
  modelo: {
    modeloId: ID_MODELO,
    versaoId: ID_VERSAO,
    nome: 'Anamnese psicológica',
    versao: 1,
    secoes: SECOES,
  },
  respostas: { queixa: 'Ansiedade', humor: 7 },
  assinadoEm: null,
  assinadoPorNome: null,
  totalAdendos: 0,
  createdAt: '2026-11-25T10:00:00.000Z',
  updatedAt: '2026-11-25T10:00:00.000Z',
};

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;
const ehLeitura = (init?: RequestInit) => !init?.method || init.method === 'GET';

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => pagina([]),
      [`${API}/${ID_PACIENTE}/paciente`]: () => json(PACIENTE),
      [`${API}/${ID_PACIENTE}/atendimentos`]: () => pagina([]),
      [`${API}/${ID_PACIENTE}/historico-clinico`]: () => pagina([]),
      [API_MODELOS]: () => pagina([MODELO, PROPRIO]),
      '/api/lookups/pacientes': () =>
        json({
          data: [{ id: ID_PACIENTE, label: PACIENTE.nome, descricao: null }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      '/api/lookups/profissionais': () =>
        json({
          data: [{ id: ID_PROFISSIONAL, label: 'Dra. Ana Teste', descricao: null }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/prontuarios', fetchMock) };
}

afterEach(() => {
  aplicarIdioma('pt-BR');
});

/** Abre o menu "Ações" da linha do modelo e escolhe o item. */
async function acaoDaLinha(user: ReturnType<typeof userEvent.setup>, linha: string, item: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

async function abrirModelos(fetchMock = api()) {
  const tela = renderTela(fetchMock);
  await tela.user.click(await screen.findByRole('tab', { name: 'Modelos' }));
  await screen.findByText('Anamnese psicológica');
  return tela;
}

describe('Modelos de prontuário: aba Modelos (#152)', () => {
  it('lista os modelos padrão e dos profissionais, com profissão, tipo e versão', async () => {
    await abrirModelos();

    expect(screen.getByText('Psicólogo')).toBeVisible();
    expect(screen.getByText('Psicologia infantil')).toBeVisible();
    expect(screen.getByText('Padrão da clínica')).toBeVisible();
    expect(screen.getByText('v2')).toBeVisible();
    expect(screen.getByText('Avaliação nutricional')).toBeVisible();
    expect(screen.getByText('Do profissional: Dra. Ana Teste')).toBeVisible();
  });

  it('filtra por profissão chamando a API com o parâmetro', async () => {
    const { user, fetchMock } = await abrirModelos();

    await user.click(screen.getByRole('combobox', { name: 'Profissão' }));
    await user.click(await screen.findByRole('option', { name: 'Nutricionista' }));

    await waitFor(() =>
      expect(
        chamadasPara(fetchMock, API_MODELOS).some(([url]) =>
          String(url).includes('profissao=NUTRICIONISTA'),
        ),
      ).toBe(true),
    );
  });

  it('novo modelo: valida os campos e envia seções e campos', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [API_MODELOS]: (init) => {
          if (ehLeitura(init)) return pagina([MODELO]);
          corpo = corpoDe(init);
          return json({ ...MODELO, ...corpo, id: PROPRIO.id }, 201);
        },
      },
    });
    const { user } = await abrirModelos(fetchMock);

    await user.click(screen.getByRole('button', { name: 'Novo modelo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo modelo' });
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Título da seção é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Rótulo é obrigatório.')).toBeVisible();

    await user.type(within(modal).getByLabelText(/^Nome/), 'Sessão de terapia');
    await user.click(within(modal).getByRole('combobox', { name: /Profissional/ }));
    await user.click(await screen.findByRole('option', { name: /Dra. Ana Teste/ }));
    await user.type(within(modal).getByLabelText(/Título da seção/), 'Sessão');
    await user.type(within(modal).getByLabelText(/^Rótulo/), 'Relato');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      nome: 'Sessão de terapia',
      profissao: 'MEDICO',
      profissionalId: ID_PROFISSIONAL,
      secoes: [{ titulo: 'Sessão', campos: [{ rotulo: 'Relato', tipo: 'TEXTO' }] }],
    });
  });

  it('o campo do tipo Lista pede ao menos 2 opções', async () => {
    const { user } = await abrirModelos();

    await user.click(screen.getByRole('button', { name: 'Novo modelo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo modelo' });
    await user.type(within(modal).getByLabelText(/^Nome/), 'Modelo com lista');
    await user.click(within(modal).getByRole('combobox', { name: /Profissional/ }));
    await user.click(await screen.findByRole('option', { name: /Dra. Ana Teste/ }));
    await user.type(within(modal).getByLabelText(/Título da seção/), 'Seção');
    await user.type(within(modal).getByLabelText(/^Rótulo/), 'Tipo de dor');
    await user.click(within(modal).getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Lista' }));
    await user.type(await within(modal).findByLabelText('Opções (uma por linha)'), 'Aguda');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    expect(await within(modal).findByText('Informe ao menos 2 opções')).toBeVisible();
  });

  it('edita um modelo e avisa que a alteração cria nova versão', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [`${API_MODELOS}/padrao/${ID_MODELO}`]: (init) => {
          corpo = corpoDe(init);
          return json({ ...MODELO, ...corpo, versao: 3 });
        },
      },
    });
    const { user } = await abrirModelos(fetchMock);

    await acaoDaLinha(user, 'Anamnese psicológica', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar modelo padrão' });
    expect(within(modal).getByText(/cria uma nova versão/)).toBeVisible();

    const nome = within(modal).getByLabelText(/^Nome/);
    await user.clear(nome);
    await user.type(nome, 'Anamnese revisada');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(corpo).toMatchObject({ nome: 'Anamnese revisada' }));
  });

  it('exclui o modelo depois da confirmação', async () => {
    let metodo = '';
    const fetchMock = api({
      rotas: {
        [`${API_MODELOS}/padrao/${ID_MODELO}`]: (init) => {
          metodo = init?.method ?? '';
          return json(MODELO);
        },
      },
    });
    const { user } = await abrirModelos(fetchMock);

    await acaoDaLinha(user, 'Anamnese psicológica', 'Excluir');
    const confirmacao = await screen.findByRole('alertdialog');
    expect(within(confirmacao).getByText(/não mudam/)).toBeVisible();
    await user.click(within(confirmacao).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(metodo).toBe('DELETE'));
  });

  it('em inglês mostra a aba e os textos traduzidos', async () => {
    const tela = renderTela(
      api({
        usuario: { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' } },
      }),
    );
    await tela.user.click(await screen.findByRole('tab', { name: 'Templates' }));

    expect(await screen.findByRole('button', { name: 'New template' })).toBeVisible();
    expect(await screen.findByText('Clinic default')).toBeVisible();
    expect(screen.getByText('Psychologist')).toBeVisible();
  });
});

describe('Modelos de prontuário: uso no atendimento (#152)', () => {
  async function abrirNovoAtendimento(fetchMock = api()) {
    const tela = renderTela(fetchMock);
    await tela.user.click(await screen.findByRole('combobox', { name: 'Buscar paciente' }));
    await tela.user.click(await screen.findByRole('option', { name: /Paciente Fictício/ }));
    await tela.user.click(await screen.findByRole('tab', { name: 'Atendimentos' }));
    await tela.user.click(await screen.findByRole('button', { name: 'Novo Atendimento' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Atendimento' });
    return { ...tela, modal };
  }

  async function escolherModelo(user: ReturnType<typeof userEvent.setup>, modal: HTMLElement) {
    await user.click(within(modal).getByRole('combobox', { name: 'Profissional' }));
    await user.click(await screen.findByRole('option', { name: /Dra. Ana Teste/ }));
    await user.click(await within(modal).findByRole('combobox', { name: 'Modelo de prontuário' }));
    await user.click(
      await screen.findByRole('option', { name: 'Anamnese psicológica (Psicologia infantil)' }),
    );
  }

  it('escolher o modelo troca os campos fixos pelos do modelo e envia as respostas', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_PACIENTE}/atendimentos`]: (init) => {
          if (ehLeitura(init)) return pagina([]);
          corpo = corpoDe(init);
          return json(ATENDIMENTO_COM_MODELO, 201);
        },
      },
    });
    const { user, modal } = await abrirNovoAtendimento(fetchMock);

    expect(within(modal).getByLabelText('Queixa')).toBeVisible();
    await escolherModelo(user, modal);

    expect(await within(modal).findByLabelText(/Queixa principal/)).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: 'Humor' })).toBeVisible();
    expect(within(modal).queryByLabelText('Queixa')).not.toBeInTheDocument();
    expect(within(modal).queryByLabelText('Evolução')).not.toBeInTheDocument();

    await user.type(within(modal).getByLabelText(/Queixa principal/), 'Ansiedade');
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      profissionalId: ID_PROFISSIONAL,
      modeloId: ID_MODELO,
      respostas: { queixa: 'Ansiedade' },
    });
  });

  it('exige os campos obrigatórios do modelo só ao finalizar', async () => {
    let enviou = false;
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_PACIENTE}/atendimentos`]: (init) => {
          if (ehLeitura(init)) return pagina([]);
          enviou = true;
          return json(ATENDIMENTO_COM_MODELO, 201);
        },
      },
    });
    const { user, modal } = await abrirNovoAtendimento(fetchMock);
    await escolherModelo(user, modal);
    await within(modal).findByLabelText(/Queixa principal/);

    await user.click(within(modal).getByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: 'Finalizado' }));
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));

    expect(await within(modal).findByText('Queixa principal é obrigatório.')).toBeVisible();
    expect(enviou).toBe(false);
  });

  it('edita as respostas do atendimento pelos campos da versão que ele usou', async () => {
    let corpo: Record<string, unknown> = {};
    const url = `${API}/${ID_PACIENTE}/atendimentos`;
    const fetchMock = api({
      rotas: {
        [url]: () => pagina([ATENDIMENTO_COM_MODELO]),
        [`${url}/${ID_ATENDIMENTO}`]: (init) => {
          corpo = corpoDe(init);
          return json({ ...ATENDIMENTO_COM_MODELO, respostas: corpo.respostas });
        },
      },
    });
    const tela = renderTela(fetchMock);
    await tela.user.click(await screen.findByRole('combobox', { name: 'Buscar paciente' }));
    await tela.user.click(await screen.findByRole('option', { name: /Paciente Fictício/ }));
    await tela.user.click(await screen.findByRole('tab', { name: 'Atendimentos' }));
    await tela.user.click(await screen.findByRole('button', { name: /Detalhes/ }));
    const detalhe = await screen.findByRole('dialog', { name: 'Atendimento' });
    await tela.user.click(within(detalhe).getByRole('button', { name: 'Editar' }));

    const edicao = await screen.findByRole('dialog', { name: 'Editar atendimento' });
    expect(within(edicao).queryByLabelText('Evolução')).not.toBeInTheDocument();
    const queixa = within(edicao).getByLabelText(/Queixa principal/);
    expect(queixa).toHaveValue('Ansiedade');
    await tela.user.clear(queixa);
    await tela.user.type(queixa, 'Ansiedade leve');
    await tela.user.click(within(edicao).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(corpo).toMatchObject({ respostas: { queixa: 'Ansiedade leve' } }));
    expect(corpo).not.toHaveProperty('queixa');
  });

  it('o detalhe do atendimento mostra o modelo, a versão usada e as respostas', async () => {
    const fetchMock = api({
      rotas: { [`${API}/${ID_PACIENTE}/atendimentos`]: () => pagina([ATENDIMENTO_COM_MODELO]) },
    });
    const tela = renderTela(fetchMock);
    await tela.user.click(await screen.findByRole('combobox', { name: 'Buscar paciente' }));
    await tela.user.click(await screen.findByRole('option', { name: /Paciente Fictício/ }));
    await tela.user.click(await screen.findByRole('tab', { name: 'Atendimentos' }));
    await tela.user.click(await screen.findByRole('button', { name: /Detalhes/ }));

    const dialogo = await screen.findByRole('dialog', { name: 'Atendimento' });
    expect(within(dialogo).getByText('Modelo: Anamnese psicológica (versão 1)')).toBeVisible();
    expect(within(dialogo).getByText('Ansiedade')).toBeVisible();
    expect(within(dialogo).getByText('7/10')).toBeVisible();
  });
});
