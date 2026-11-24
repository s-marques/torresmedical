import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PERMISSOES,
  PREFERENCIAS_PADRAO,
  type ClassificacaoHistorico,
  type Profissional,
  type UsuarioSessao,
} from '@torres/shared';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers/AppProviders';
import { entrar } from '@/lib/auth/sessao';
import { apiFalsa, chamadasPara, json, sessaoJson, USUARIO_TESTE } from '@/test/render-app';
import { ClassificacaoProfissional } from './ClassificacaoProfissional';

vi.setConfig({ testTimeout: 20_000 });

const PROF = '00000000-0000-4000-8000-0000000000a1';
const API = `/api/gestao-profissionais/profissionais/${PROF}`;
const URL_HISTORICO = `${API}/classificacoes`;
const URL_ESTRATEGICO = `${API}/estrategico`;

function profissional(parcial: Partial<Profissional> = {}): Profissional {
  return {
    id: PROF,
    nome: 'Dra. Ana Fictícia',
    especialidadeId: null,
    especialidadeNome: null,
    registro: null,
    profissao: null,
    subespecialidade: null,
    cnpj: null,
    rqes: [],
    contatosAdministrativos: [],
    outrasEspecialidades: null,
    email: null,
    telefone: null,
    duracaoPadrao: 30,
    valorConsulta: null,
    comissao: null,
    corCalendario: 'azul',
    cpf: null,
    rg: null,
    dataNascimento: null,
    naturalidade: null,
    estadoCivil: null,
    endereco: null,
    enderecoConsultorio: null,
    telefoneReceita: null,
    cnes: null,
    rodapeReceita: null,
    layoutReceita: 'PADRAO',
    memedApiToken: null,
    memedSecretKeyDefinida: false,
    fotoArquivoId: null,
    logoReceitaArquivoId: null,
    ativo: true,
    classificacao: 'EM_RISCO',
    classificacaoMotivo: 'BAIXO_USO',
    classificacaoParametros: { contratados: 4, utilizados: 1 },
    classificacaoMotivoTexto: '1 de 4 períodos usados em 30 dias',
    classificacaoEm: '2026-11-24T06:00:00.000Z',
    estrategico: false,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
    ...parcial,
  };
}

function historico(parcial: Partial<ClassificacaoHistorico> = {}): ClassificacaoHistorico {
  return {
    id: '00000000-0000-4000-8000-0000000000b1',
    profissionalId: PROF,
    classificacaoAnterior: 'ATIVO',
    classificacao: 'EM_RISCO',
    motivo: 'BAIXO_USO',
    parametros: { contratados: 4, utilizados: 1 },
    motivoTexto: '1 de 4 períodos usados em 30 dias',
    origem: 'AUTOMATICO',
    usuarioId: null,
    referencia: '2026-11-24',
    createdAt: '2026-11-24T06:00:00.000Z',
    ...parcial,
  };
}

function pagina(data: ClassificacaoHistorico[], totalPages = 1) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages } });
}

async function renderSecao(
  p: Profissional,
  rotas: NonNullable<Parameters<typeof apiFalsa>[0]>['rotas'] = {},
  usuario: UsuarioSessao = USUARIO_TESTE,
) {
  const fetchMock = apiFalsa({
    usuario,
    rotas: {
      '/api/auth/login': () => sessaoJson(usuario),
      [URL_HISTORICO]: () => pagina([historico()]),
      ...rotas,
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  await entrar({ email: 'pessoa@example.com', senha: 'x' });
  const router = createMemoryRouter(
    [{ path: '/', element: <ClassificacaoProfissional profissional={p} /> }],
    { initialEntries: ['/'] },
  );
  render(
    <AppProviders onUnauthorized={vi.fn()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { fetchMock, user: userEvent.setup() };
}

describe('Classificação do parceiro no detalhe do profissional', () => {
  it('mostra a classificação, o motivo em texto e o histórico com a mudança', async () => {
    await renderSecao(profissional());

    expect(await screen.findByRole('heading', { name: 'Classificação do parceiro' })).toBeVisible();
    const secao = screen.getByRole('region', { name: 'Classificação do parceiro' });
    expect(within(secao).getAllByText('Em risco').length).toBeGreaterThan(0);
    const item = await screen.findByRole('listitem');
    expect(within(secao).getAllByText('1 de 4 períodos usados em 30 dias')).toHaveLength(2);
    expect(within(secao).getByText(/Nesta classificação desde/)).toBeVisible();
    expect(within(item).getByText('Parceiro ativo')).toBeVisible();
    expect(within(item).getByText('Em risco')).toBeVisible();
    expect(within(item).getByText(/24\/11\/2026 · Cálculo diário/)).toBeVisible();
  });

  it('sem cálculo ainda, avisa que roda todo dia', async () => {
    await renderSecao(
      profissional({
        classificacao: null,
        classificacaoMotivo: null,
        classificacaoMotivoTexto: null,
        classificacaoEm: null,
      }),
      { [URL_HISTORICO]: () => pagina([]) },
    );

    expect(await screen.findByText('Ainda não calculada. O cálculo roda todo dia.')).toBeVisible();
    expect(await screen.findByText('Nenhuma mudança de classificação registrada.')).toBeVisible();
  });

  it('marcar "Parceiro estratégico" envia o PUT, atualiza a classificação e o histórico', async () => {
    const corpos: unknown[] = [];
    const { user, fetchMock } = await renderSecao(profissional(), {
      [URL_ESTRATEGICO]: (init) => {
        corpos.push(JSON.parse(String(init?.body)));
        return json(
          profissional({
            classificacao: 'ESTRATEGICO',
            classificacaoMotivo: 'MARCADO_ESTRATEGICO',
            classificacaoParametros: {},
            estrategico: true,
          }),
        );
      },
    });

    await user.click(await screen.findByRole('switch', { name: 'Parceiro estratégico' }));

    await waitFor(() => expect(corpos).toEqual([{ estrategico: true }]));
    expect(await screen.findByText('Marcado como estratégico pela gerência')).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Parceiro estratégico' })).toBeChecked();
    await waitFor(() => expect(chamadasPara(fetchMock, URL_HISTORICO).length).toBeGreaterThan(1));
  });

  it('sem permissão de editar não oferece a marca de estratégico', async () => {
    const somenteLeitura = {
      ...USUARIO_TESTE,
      permissoes: PERMISSOES.filter((p) => p !== 'gestao-profissionais.profissionais.editar'),
    };
    await renderSecao(profissional(), {}, somenteLeitura);

    await screen.findByRole('listitem');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('pagina o histórico quando há mais de uma página', async () => {
    const { user, fetchMock } = await renderSecao(profissional(), {
      [URL_HISTORICO]: () => pagina([historico()], 3),
    });

    expect(await screen.findByText('Página 1 de 3')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Próxima' }));

    await waitFor(() =>
      expect(chamadasPara(fetchMock, URL_HISTORICO).at(-1)?.[0]).toContain('page=2'),
    );
  });

  it('erro ao carregar o histórico mostra o aviso', async () => {
    await renderSecao(profissional(), {
      [URL_HISTORICO]: () => json({ statusCode: 500, code: 'ERRO', message: 'x' }, 500),
    });

    expect(await screen.findByText('Não foi possível carregar o histórico.')).toBeVisible();
  });

  it('textos no idioma do usuário (inglês)', async () => {
    await renderSecao(
      profissional(),
      {},
      {
        ...USUARIO_TESTE,
        preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' },
      },
    );

    expect(await screen.findByRole('heading', { name: 'Partner classification' })).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Strategic partner' })).toBeVisible();
    const item = await screen.findByRole('listitem');
    expect(within(item).getByText('Active partner')).toBeVisible();
    expect(within(item).getByText('At risk')).toBeVisible();
    expect(screen.getAllByText('1 of 4 slots used in 30 days')).toHaveLength(2);
    expect(screen.getByText('Change history')).toBeVisible();
  });
});
