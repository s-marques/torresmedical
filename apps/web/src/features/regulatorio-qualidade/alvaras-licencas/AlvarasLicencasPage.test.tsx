import { PERMISSOES, PREFERENCIAS_PADRAO, type Licenca } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/regulatorio-qualidade/licencas';
const API_TIPOS = '/api/regulatorio-qualidade/tipos-licenca';
const ID_1 = '00000000-0000-4000-8000-0000000000a1';
const UNIDADE_ID = '00000000-0000-4000-8000-0000000000b1';
const TIPO_ID = '00000000-0000-4000-8000-0000000000c1';

function licenca(parcial: Partial<Licenca> = {}): Licenca {
  return {
    id: ID_1,
    unidadeId: UNIDADE_ID,
    unidadeNome: 'Matriz',
    tipoLicencaId: TIPO_ID,
    tipoLicencaNome: 'Alvará Sanitário',
    naoSeAplica: false,
    numeroDocumento: '123/2026',
    orgaoEmissor: 'Prefeitura',
    titular: null,
    dataEmissao: null,
    dataVencimento: '2026-12-10',
    telefone: null,
    email: null,
    departamento: null,
    plataformaOnline: false,
    comoRenovar: null,
    documentosObrigatorios: null,
    enderecoPresencial: null,
    horarioAtendimento: null,
    prazoAnalise: null,
    responsavel: 'Fulana',
    observacoes: null,
    diasRestantes: 21,
    status: 'alerta-30',
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
    ...parcial,
  };
}

const RESUMO = { total: 5, ok: 1, alerta60: 1, alerta30: 2, vencido: 1, naoSeAplica: 0 };

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

function rotasPadrao(extra: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...extra,
    rotas: {
      [API]: () => pagina([licenca()]),
      [`${API}/resumo`]: () => json(RESUMO),
      [`${API}/alertas`]: () => json([licenca()]),
      [`${API}/ordem-renovacao`]: () => json([licenca({ numeroDocumento: 'X' })]),
      [API_TIPOS]: () =>
        json([
          {
            id: TIPO_ID,
            nome: 'Alvará Sanitário',
            descricao: null,
            createdAt: '2026-11-01T12:00:00.000Z',
          },
        ]),
      ...extra.rotas,
    },
  });
}

function renderTela(extra: Parameters<typeof apiFalsa>[0] = {}, path = '/alvaras') {
  const fetchMock = rotasPadrao(extra);
  return { user: userEvent.setup(), ...renderApp(path, fetchMock), fetchMock };
}

describe('Alvarás e Licenças (/alvaras)', () => {
  it('mostra título, ações, abas, totais e as colunas do inventário', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Alvarás e Licenças' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Tipo' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova Licença' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Licenças' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Alertas' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Ordem Renovação' })).toBeVisible();
    await waitFor(() => expect(screen.getByTestId('resumo-total')).toHaveTextContent('5'));
    expect(screen.getByTestId('resumo-alerta')).toHaveTextContent('3');
    expect(screen.getByTestId('resumo-vencido')).toHaveTextContent('1');

    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Tipo Licença',
      'Unidade',
      'Nº Documento',
      'Órgão Emissor',
      'Vencimento',
      'Dias',
      'Status',
      'Responsável',
      'Ações',
    ]);
    const linha = (await screen.findByText('123/2026')).closest('tr') as HTMLElement;
    expect(within(linha).getByText('Alvará Sanitário')).toBeVisible();
    expect(within(linha).getByText('Matriz')).toBeVisible();
    expect(within(linha).getByText('21')).toBeVisible();
    expect(within(linha).getByText('Alerta 30 dias')).toBeVisible();
  });

  it('filtra por status pelos chips e ordena por coluna chamando a API', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('123/2026');

    await user.click(screen.getByRole('button', { name: 'Vencido' }));
    await waitFor(() =>
      expect(chamadasPara(fetchMock, API).some(([url]) => url.includes('status=vencido'))).toBe(
        true,
      ),
    );

    await user.click(screen.getByRole('button', { name: /Unidade/ }));
    await waitFor(() =>
      expect(chamadasPara(fetchMock, API).some(([url]) => url.includes('sort=unidade'))).toBe(true),
    );
  });

  it('aba Alertas lista as licenças a vencer e Ordem Renovação, por vencimento', async () => {
    const { user } = renderTela();
    await screen.findByText('123/2026');

    await user.click(screen.getByRole('tab', { name: 'Alertas' }));
    expect(await screen.findByText('Alvará Sanitário')).toBeVisible();
    expect(screen.getByText('Alerta 30 dias')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Ordem Renovação' }));
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));
  });

  it('aba Alertas vazia mostra a mensagem de estado vazio', async () => {
    const { user } = renderTela({ rotas: { [`${API}/alertas`]: () => json([]) } });
    await screen.findByText('123/2026');

    await user.click(screen.getByRole('tab', { name: 'Alertas' }));

    expect(
      await screen.findByText('Nenhuma licença vencida ou a vencer em até 60 dias.'),
    ).toBeVisible();
  });

  it('Novo Tipo: Nome é obrigatório e nada é enviado sem ele', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('123/2026');

    await user.click(screen.getByRole('button', { name: 'Novo Tipo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Tipo de Licença' });
    expect(within(modal).getByText(/licença "Não se aplica" para cada unidade/)).toBeVisible();
    await user.click(within(modal).getByRole('button', { name: 'Criar Tipo' }));

    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API_TIPOS).filter(([, i]) => i?.method === 'POST')).toHaveLength(
      0,
    );
  });

  it('Novo Tipo: envia nome e descrição, fecha o modal', async () => {
    let corpo: unknown;
    const { user } = renderTela({
      rotas: {
        [API_TIPOS]: (init) => {
          if (init?.method !== 'POST') return json([]);
          corpo = JSON.parse(String(init.body));
          return json(
            {
              id: TIPO_ID,
              nome: 'Alvará Bombeiro',
              descricao: 'x',
              createdAt: '2026-11-01T12:00:00.000Z',
            },
            201,
          );
        },
      },
    });
    await screen.findByText('123/2026');

    await user.click(screen.getByRole('button', { name: 'Novo Tipo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Tipo de Licença' });
    await user.type(within(modal).getByLabelText('Nome'), 'Alvará Bombeiro');
    await user.type(within(modal).getByLabelText('Descrição'), 'x');
    await user.click(within(modal).getByRole('button', { name: 'Criar Tipo' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ nome: 'Alvará Bombeiro', descricao: 'x' });
  });

  it('Nova Licença: Unidade e Tipo de Licença são obrigatórios e nada é enviado sem eles', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('123/2026');

    await user.click(screen.getByRole('button', { name: 'Nova Licença' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Licença' });
    expect(within(modal).getByText('Dados do Documento')).toBeVisible();
    expect(within(modal).getByText('Contato e Departamento')).toBeVisible();
    expect(within(modal).getByText('Renovação')).toBeVisible();
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('Unidade é obrigatória.')).toBeVisible();
    expect(within(modal).getByText('Tipo de Licença é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Editar licença: abre preenchida e envia as alterações com PATCH', async () => {
    let corpo: unknown;
    const { user } = renderTela({
      rotas: {
        [`${API}/${ID_1}`]: (init) => {
          corpo = JSON.parse(String(init?.body));
          return json(licenca({ numeroDocumento: 'NOVO/2026' }));
        },
        [`/api/lookups/unidades/${UNIDADE_ID}`]: () => json({ id: UNIDADE_ID, label: 'Matriz' }),
      },
    });
    const linha = (await screen.findByText('123/2026')).closest('tr') as HTMLElement;

    await user.click(within(linha).getByRole('button', { name: 'Ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Licença' });
    const numero = within(modal).getByLabelText('Número do Documento');
    expect(numero).toHaveValue('123/2026');
    await user.clear(numero);
    await user.type(numero, 'NOVO/2026');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      unidadeId: UNIDADE_ID,
      tipoLicencaId: TIPO_ID,
      numeroDocumento: 'NOVO/2026',
    });
  });

  it('sem a permissão criar, esconde Novo Tipo e Nova Licença', async () => {
    renderTela({
      usuario: {
        ...USUARIO_TESTE,
        permissoes: PERMISSOES.filter((p) => p !== 'regulatorio-qualidade.alvaras-licencas.criar'),
      },
    });
    await screen.findByText('123/2026');
    expect(screen.queryByRole('button', { name: 'Novo Tipo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova Licença' })).not.toBeInTheDocument();
  });

  it('em inglês traduz a tela, as colunas, os status e a validação', async () => {
    const { user } = renderTela({
      usuario: { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' } },
    });

    expect(await screen.findByRole('heading', { name: 'Permits and Licenses' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'New Type' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Renewal Order' })).toBeVisible();
    expect(await screen.findByText('Alert 30 days')).toBeVisible();
    expect(screen.getByRole('columnheader', { name: /License Type/ })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'New License' }));
    const modal = await screen.findByRole('dialog', { name: 'New License' });
    await user.click(within(modal).getByRole('button', { name: 'Register' }));
    expect(await within(modal).findByText(/Unit is required/)).toBeVisible();
  });
});
