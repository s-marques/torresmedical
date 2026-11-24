import {
  PREFERENCIAS_PADRAO,
  type PacienteResumo as Paciente,
  type PacientePossivelDuplicado,
  type UsuarioSessao,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/pacientes';
const VERIFICAR = `${API}/duplicidade`;
const ID_1 = '00000000-0000-4000-8000-0000000000b1';
const ID_2 = '00000000-0000-4000-8000-0000000000b2';
const AGORA = '2026-10-20T12:00:00.000Z';

function paciente(parcial: Partial<Paciente> = {}): Paciente {
  return {
    id: ID_1,
    tipo: 'PF',
    nome: 'Ana Existente',
    nomeSocial: null,
    email: null,
    documento: '52998224725',
    rg: null,
    menorIdade: false,
    telefone: null,
    celular: '65999990001',
    dataNascimento: '1990-05-17',
    sexo: null,
    profissao: null,
    origemClienteId: null,
    origemNome: null,
    status: 'ATIVO',
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

const CANDIDATO: PacientePossivelDuplicado = {
  id: ID_1,
  nome: 'Ana Existente',
  cpfMascarado: '***.982.247-**',
  dataNascimento: '1990-05-17',
  motivos: ['TELEFONE'],
};

type Corpo = Record<string, unknown>;
const corpoDe = (init?: RequestInit): Corpo => JSON.parse(String(init?.body)) as Corpo;

const pagina = (data: Paciente[]) =>
  json({ data, meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 } });

interface Cenario {
  candidatos?: PacientePossivelDuplicado[];
  /** A verificação só acha duplicado depois que o envio foi tentado (409 da API). */
  soDepoisDoPost?: boolean;
  post?: () => Response;
  usuario?: UsuarioSessao;
}

function montar({ candidatos = [CANDIDATO], soDepoisDoPost = false, post, usuario }: Cenario = {}) {
  const corpos: Corpo[] = [];
  const posts: Corpo[] = [];
  const fetchMock = apiFalsa({
    usuario,
    rotas: {
      [API]: (init) => {
        if (init?.method !== 'POST') return pagina([paciente({ id: ID_2, nome: 'Outra Pessoa' })]);
        posts.push(corpoDe(init));
        return post ? post() : json(paciente({ id: ID_2, nome: 'Nova' }), 201);
      },
      [VERIFICAR]: (init) => {
        const corpo = corpoDe(init);
        corpos.push(corpo);
        // Como a API: sem telefone, e-mail ou nome + nascimento não há o que comparar.
        const identifica = Boolean(corpo.celular ?? corpo.telefone ?? corpo.email);
        const achou = identifica && (!soDepoisDoPost || posts.length > 0);
        return json({ candidatos: achou ? candidatos : [] });
      },
      [`${API}/${ID_1}`]: () => json(paciente()),
    },
  });
  return { fetchMock, corpos, posts };
}

/** Marca os três consentimentos e o canal (obrigatórios no cadastro novo, #148). */
async function marcarConsentimentos(modal: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  for (const tipo of ['Tratamento de dados', 'Comunicação', 'Campanhas']) {
    const grupo = within(modal).getByRole('radiogroup', { name: tipo });
    await user.click(within(grupo).getByRole('radio', { name: 'Aceito' }));
  }
  await user.selectOptions(
    within(modal).getByLabelText('Onde foi dado o consentimento'),
    'PRESENCIAL',
  );
}

async function abrirNovo(fetchMock: ReturnType<typeof apiFalsa>, consentimentos = true) {
  const user = userEvent.setup();
  renderApp('/clientes', fetchMock);
  await screen.findByText('Outra Pessoa');
  await user.click(screen.getByRole('button', { name: 'Novo Paciente' }));
  const modal = await screen.findByRole('dialog', { name: 'Novo Paciente' });
  // Antes de digitar: sair dos campos de contato já pode abrir o alerta.
  if (consentimentos) await marcarConsentimentos(modal, user);
  return { user, modal };
}

describe('Pacientes: alerta de possível duplicado (#149)', () => {
  it('ao sair do campo, procura e mostra os possíveis registros com o motivo', async () => {
    const { fetchMock, corpos } = montar();
    const { user, modal } = await abrirNovo(fetchMock);

    await user.type(within(modal).getByPlaceholderText('Nome completo'), 'Ana Nova');
    await user.type(within(modal).getByLabelText('Celular'), '65999990001');
    await user.tab();

    const alerta = await screen.findByRole('dialog', { name: 'Possível paciente duplicado' });
    expect(
      within(alerta).getByText(
        'Paciente possivelmente já cadastrado. Deseja abrir o registro existente?',
      ),
    ).toBeVisible();
    expect(within(alerta).getByText('Ana Existente')).toBeVisible();
    expect(within(alerta).getByText('CPF: ***.982.247-**')).toBeVisible();
    expect(within(alerta).getByText('Nascimento: 17/05/1990')).toBeVisible();
    expect(within(alerta).getByText('Mesmo telefone')).toBeVisible();
    expect(corpos.at(-1)).toMatchObject({ nome: 'Ana Nova', celular: '65999990001' });
    expect(corpos.at(-1)).not.toHaveProperty('pacienteId', expect.anything());
  });

  it('sem possíveis registros, não alerta', async () => {
    const { fetchMock, corpos } = montar({ candidatos: [] });
    const { user, modal } = await abrirNovo(fetchMock);

    await user.type(within(modal).getByLabelText('Celular'), '65999990001');
    await user.tab();

    await waitFor(() => expect(corpos.length).toBeGreaterThan(0));
    expect(screen.queryByRole('dialog', { name: 'Possível paciente duplicado' })).toBeNull();
  });

  it('sem verDadosSensiveis o CPF não aparece', async () => {
    const { fetchMock } = montar({ candidatos: [{ ...CANDIDATO, cpfMascarado: null }] });
    const { user, modal } = await abrirNovo(fetchMock);

    await user.type(within(modal).getByLabelText('Celular'), '65999990001');
    await user.tab();

    const alerta = await screen.findByRole('dialog', { name: 'Possível paciente duplicado' });
    expect(within(alerta).getByText('Ana Existente')).toBeVisible();
    expect(within(alerta).queryByText(/CPF:/)).toBeNull();
  });

  it('Abrir registro existente: fecha o cadastro e mostra o paciente', async () => {
    const { fetchMock, posts } = montar();
    const { user, modal } = await abrirNovo(fetchMock);
    await user.type(within(modal).getByLabelText('Celular'), '65999990001');
    await user.tab();

    const alerta = await screen.findByRole('dialog', { name: 'Possível paciente duplicado' });
    await user.click(within(alerta).getByRole('button', { name: 'Abrir registro existente' }));

    expect(await screen.findByText('Ana Existente')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo Paciente' })).toBeNull());
    expect(chamadasPara(fetchMock, `${API}/${ID_1}`)).toHaveLength(1);
    expect(posts).toHaveLength(0);
  });

  it('Cadastrar com possível duplicado: alerta e não envia; Continuar cadastro envia confirmado', async () => {
    const { fetchMock, posts } = montar();
    const { user, modal } = await abrirNovo(fetchMock);
    await user.type(within(modal).getByPlaceholderText('Nome completo'), 'Ana Nova');
    await user.type(within(modal).getByLabelText('Celular'), '65999990001');

    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));
    const alerta = await screen.findByRole('dialog', { name: 'Possível paciente duplicado' });
    expect(posts).toHaveLength(0);

    await user.click(within(alerta).getByRole('button', { name: 'Continuar cadastro' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      nome: 'Ana Nova',
      celular: '65999990001',
      duplicidadeConfirmada: true,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Voltar fecha o alerta sem confirmar nem gravar', async () => {
    const { fetchMock, posts } = montar();
    const { user, modal } = await abrirNovo(fetchMock);
    await user.type(within(modal).getByPlaceholderText('Nome completo'), 'Ana Nova');
    await user.type(within(modal).getByLabelText('Celular'), '65999990001');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    const alerta = await screen.findByRole('dialog', { name: 'Possível paciente duplicado' });
    await user.click(within(alerta).getByRole('button', { name: 'Voltar' }));

    expect(screen.queryByRole('dialog', { name: 'Possível paciente duplicado' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Novo Paciente' })).toBeVisible();
    expect(posts).toHaveLength(0);
  });

  it('Continuar cadastro depois de sair do campo só fecha o alerta; salvar envia confirmado sem alertar de novo', async () => {
    const { fetchMock, corpos, posts } = montar();
    const { user, modal } = await abrirNovo(fetchMock);
    await user.type(within(modal).getByPlaceholderText('Nome completo'), 'Ana Nova');
    await user.type(within(modal).getByLabelText('Celular'), '65999990001');
    await user.tab();
    const alerta = await screen.findByRole('dialog', { name: 'Possível paciente duplicado' });

    await user.click(within(alerta).getByRole('button', { name: 'Continuar cadastro' }));
    expect(posts).toHaveLength(0);
    const consultas = corpos.length;

    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ duplicidadeConfirmada: true });
    expect(corpos).toHaveLength(consultas);
  });

  it('se a API acusar o duplicado no envio (409), mostra o alerta', async () => {
    const { fetchMock, posts } = montar({
      soDepoisDoPost: true,
      post: () =>
        json(
          {
            statusCode: 409,
            code: 'PACIENTE_POSSIVEL_DUPLICADO',
            message: 'Paciente possivelmente já cadastrado. Deseja abrir o registro existente?',
          },
          409,
        ),
    });
    const { user, modal } = await abrirNovo(fetchMock);
    await user.type(within(modal).getByPlaceholderText('Nome completo'), 'Ana Nova');
    await user.type(within(modal).getByLabelText('Celular'), '65999990001');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(
      await screen.findByRole('dialog', { name: 'Possível paciente duplicado' }),
    ).toBeVisible();
    expect(posts).toHaveLength(1);
  });

  it('na edição envia o id do paciente para a API ignorar o próprio cadastro', async () => {
    const { fetchMock, corpos } = montar({ candidatos: [] });
    const user = userEvent.setup();
    renderApp('/clientes', fetchMock);
    await screen.findByText('Outra Pessoa');
    await user.click(screen.getAllByRole('button', { name: 'Ações' })[0] as HTMLElement);
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Paciente' });

    await user.clear(within(modal).getByLabelText('Celular'));
    await user.type(within(modal).getByLabelText('Celular'), '65988880002');
    await user.tab();

    await waitFor(() => expect(corpos.length).toBeGreaterThan(0));
    expect(corpos.at(-1)).toMatchObject({ pacienteId: ID_2, celular: '65988880002' });
  });

  it('textos em inglês', async () => {
    const { fetchMock } = montar({
      usuario: { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' } },
    });
    const { user, modal } = await abrirNovo(fetchMock, false);
    await user.type(within(modal).getByLabelText('Celular'), '65999990001');
    await user.tab();

    const alerta = await screen.findByRole('dialog', { name: 'Possible duplicate patient' });
    expect(
      within(alerta).getByText(
        'This patient may already be registered. Do you want to open the existing record?',
      ),
    ).toBeVisible();
    expect(within(alerta).getByText('Same phone')).toBeVisible();
    expect(within(alerta).getByRole('button', { name: 'Open existing record' })).toBeVisible();
    expect(within(alerta).getByRole('button', { name: 'Continue registration' })).toBeVisible();
    expect(within(alerta).getByRole('button', { name: 'Go back' })).toBeVisible();
  });
});
