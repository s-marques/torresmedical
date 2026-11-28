import { PREFERENCIAS_PADRAO, type AcompanhamentoMetas, type MetaComercial } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { aplicarIdioma } from '@/lib/i18n';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/comercial-atendimento/metas';
const ID_1 = '00000000-0000-4000-8000-0000000000f1';
const ID_2 = '00000000-0000-4000-8000-0000000000f2';
const ANA = '00000000-0000-4000-8000-0000000000d1';
const ANO = new Date().getFullYear();

function meta(parcial: Partial<MetaComercial> = {}): MetaComercial {
  return {
    id: ID_1,
    metrica: 'LEADS',
    periodoTipo: 'MES',
    periodo: '2026-11',
    dataInicio: '2026-11-01',
    dataFim: '2026-11-30',
    responsavelId: null,
    responsavel: null,
    observacoes: null,
    valor: 40,
    realizado: 25,
    percentual: 62.5,
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
    ...parcial,
  };
}

const METAS = [
  meta(),
  meta({
    id: ID_2,
    metrica: 'RECEITA_NOVA',
    periodoTipo: 'TRIMESTRE',
    periodo: '2026-T4',
    dataInicio: '2026-10-01',
    dataFim: '2026-12-31',
    responsavelId: ANA,
    responsavel: 'Ana Teste',
    valor: 20000,
    realizado: 25000,
    percentual: 125,
  }),
];

const ACOMPANHAMENTO: AcompanhamentoMetas = {
  resumo: [
    { metrica: 'LEADS', projetado: 80, realizado: 50, percentual: 62.5 },
    { metrica: 'RECEITA_NOVA', projetado: 20000, realizado: 25000, percentual: 125 },
  ],
  evolucao: [
    {
      metrica: 'LEADS',
      periodoTipo: 'MES',
      periodo: '2026-10',
      dataInicio: '2026-10-01',
      projetado: 40,
      realizado: 25,
      percentual: 62.5,
    },
    {
      metrica: 'LEADS',
      periodoTipo: 'MES',
      periodo: '2026-11',
      dataInicio: '2026-11-01',
      projetado: 40,
      realizado: 25,
      percentual: 62.5,
    },
    {
      metrica: 'RECEITA_NOVA',
      periodoTipo: 'TRIMESTRE',
      periodo: '2026-T4',
      dataInicio: '2026-10-01',
      projetado: 20000,
      realizado: 25000,
      percentual: 125,
    },
  ],
};

const pagina = (data: MetaComercial[]) =>
  json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;
const consultaDe = (fetchMock: ReturnType<typeof apiFalsa>, caminho: string) => {
  const [url] = chamadasPara(fetchMock, caminho).at(-1) ?? [''];
  return new URL(url, 'http://x').searchParams;
};

function api(
  rotas: NonNullable<Parameters<typeof apiFalsa>[0]>['rotas'] = {},
  usuario = USUARIO_TESTE,
) {
  return apiFalsa({
    usuario,
    rotas: {
      [API]: () => pagina(METAS),
      [`${API}/acompanhamento`]: () => json(ACOMPANHAMENTO),
      [`${API}/responsaveis`]: () => json([{ id: ANA, nome: 'Ana Teste' }]),
      ...rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/crm/metas', fetchMock) };
}

type Usuario = ReturnType<typeof userEvent.setup>;

async function abrirAbaMetas(user: Usuario) {
  await user.click(await screen.findByRole('tab', { name: 'Metas' }));
  await screen.findByText('Receita nova', { selector: 'td' });
}

async function escolher(user: Usuario, modal: HTMLElement, campo: RegExp | string, opcao: string) {
  await user.click(within(modal).getByRole('combobox', { name: campo }));
  await user.click(await screen.findByRole('option', { name: opcao }));
}

afterEach(() => aplicarIdioma('pt-BR'));

describe('Metas (/crm/metas)', { timeout: 20_000 }, () => {
  it('acompanhamento: percentual por métrica e evolução período a período', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Metas' })).toBeVisible();
    const leads = await screen.findByTestId('resumo-LEADS');
    expect(within(leads).getByText('62,5%')).toBeVisible();
    expect(within(leads).getByText('50 de 80')).toBeVisible();
    const receita = screen.getByTestId('resumo-RECEITA_NOVA');
    expect(within(receita).getByText('125%')).toBeVisible();
    expect(within(receita).getByText('R$ 25.000,00 de R$ 20.000,00')).toBeVisible();

    const evolucao = screen.getByTestId('evolucao-LEADS');
    const linhas = within(evolucao).getAllByRole('row').slice(1);
    expect(linhas.map((l) => within(l).getAllByRole('cell')[0]?.textContent)).toEqual([
      'outubro de 2026',
      'novembro de 2026',
    ]);
    expect(
      within(screen.getByTestId('evolucao-RECEITA_NOVA')).getByText('4º trimestre de 2026'),
    ).toBeVisible();
  });

  it('acompanhamento: filtros de período, responsável e métrica vão para a API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByTestId('resumo-LEADS');

    await user.type(screen.getByLabelText('Data inicial'), '2026-10-01');
    await user.type(screen.getByLabelText('Data final'), '2026-12-31');
    await user.click(screen.getByRole('combobox', { name: 'Responsável' }));
    await user.click(await screen.findByRole('option', { name: 'Ana Teste' }));
    await user.click(screen.getByRole('combobox', { name: 'Métrica' }));
    await user.click(await screen.findByRole('option', { name: 'Visitas' }));

    await waitFor(() => {
      const query = consultaDe(fetchMock, `${API}/acompanhamento`);
      expect(query.get('de')).toBe('2026-10-01');
      expect(query.get('ate')).toBe('2026-12-31');
      expect(query.get('responsavelId')).toBe(ANA);
      expect(query.get('metrica')).toBe('VISITAS');
    });
  });

  it('acompanhamento sem metas orienta a cadastrar; erro mostra o aviso', async () => {
    const vazio = renderTela(
      api({ [`${API}/acompanhamento`]: () => json({ resumo: [], evolucao: [] }) }),
    );
    expect(await screen.findByText(/Nenhuma meta cadastrada no período/)).toBeVisible();
    vazio.unmount();

    renderTela(
      api({
        [`${API}/acompanhamento`]: () => json({ statusCode: 500, code: 'ERRO', message: 'x' }, 500),
      }),
    );
    expect(
      await screen.findByText('Não foi possível carregar o acompanhamento das metas.'),
    ).toBeVisible();
  });

  it('aba Metas: colunas com projetado, realizado e % atingido, e filtro por métrica', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await abrirAbaMetas(user);

    const cabecalhos = within(screen.getByRole('table'))
      .getAllByRole('columnheader')
      .map((c) => c.textContent);
    expect(cabecalhos).toEqual([
      'Métrica',
      'Período',
      'Responsável',
      'Projetado',
      'Realizado',
      'Atingido',
      'Ações',
    ]);
    const receita = screen
      .getByText('Receita nova', { selector: 'td' })
      .closest('tr') as HTMLElement;
    expect(within(receita).getByText('4º trimestre de 2026')).toBeVisible();
    expect(within(receita).getByText('Ana Teste')).toBeVisible();
    expect(within(receita).getByText('R$ 20.000,00')).toBeVisible();
    expect(within(receita).getByText('R$ 25.000,00')).toBeVisible();
    expect(within(receita).getByText('125%')).toBeVisible();
    const leads = screen.getByText('Leads', { selector: 'td' }).closest('tr') as HTMLElement;
    expect(within(leads).getByText('Equipe comercial toda')).toBeVisible();
    expect(within(leads).getByText('62,5%')).toBeVisible();

    await user.click(screen.getByRole('combobox', { name: 'Métrica' }));
    await user.click(await screen.findByRole('option', { name: 'Leads' }));
    await waitFor(() => expect(consultaDe(fetchMock, API).get('metrica')).toBe('LEADS'));
  });

  it('Nova Meta: valida o valor e envia a meta (receita em reais, equipe toda)', async () => {
    let corpo: Record<string, unknown> | null = null;
    const fetchMock = api({
      [API]: (init) => {
        if (init?.method === 'POST') {
          corpo = corpoDe(init);
          return json(meta({ id: ID_2 }), 201);
        }
        return pagina(METAS);
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByTestId('resumo-LEADS');

    await user.click(screen.getByRole('button', { name: 'Nova Meta' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Meta' });
    await user.click(within(modal).getByRole('button', { name: 'Criar Meta' }));
    expect(await within(modal).findByText('Valor é obrigatório.')).toBeVisible();
    expect(corpo).toBeNull();

    await escolher(user, modal, /Métrica/, 'Receita nova');
    await escolher(user, modal, /^Período/, `março de ${ANO}`);
    await user.type(within(modal).getByLabelText(/Meta projetada/), '1500000');
    await user.click(within(modal).getByRole('button', { name: 'Criar Meta' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      metrica: 'RECEITA_NOVA',
      periodoTipo: 'MES',
      periodo: `${ANO}-03`,
      responsavelId: null,
      valor: 15000,
      observacoes: null,
    });
  });

  it('Nova Meta por trimestre e responsável: troca o formato do período', async () => {
    let corpo: Record<string, unknown> | null = null;
    const fetchMock = api({
      [API]: (init) => {
        if (init?.method === 'POST') {
          corpo = corpoDe(init);
          return json(meta({ id: ID_2 }), 201);
        }
        return pagina(METAS);
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByTestId('resumo-LEADS');

    await user.click(screen.getByRole('button', { name: 'Nova Meta' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Meta' });
    await escolher(user, modal, /Tipo de período/, 'Trimestre');
    await escolher(user, modal, /^Período/, `2º trimestre de ${ANO}`);
    await escolher(user, modal, /Responsável/, 'Ana Teste');
    await user.type(within(modal).getByLabelText(/Meta projetada/), '30');
    await user.click(within(modal).getByRole('button', { name: 'Criar Meta' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      metrica: 'LEADS',
      periodoTipo: 'TRIMESTRE',
      periodo: `${ANO}-T2`,
      responsavelId: ANA,
      valor: 30,
    });
  });

  it('Editar: preenche a meta e envia as alterações', async () => {
    let corpo: Record<string, unknown> | null = null;
    const fetchMock = api({
      [`${API}/${ID_1}`]: (init) => {
        corpo = corpoDe(init);
        return json(meta({ valor: 55 }));
      },
    });
    const { user } = renderTela(fetchMock);
    await abrirAbaMetas(user);

    const linha = screen.getByText('Leads', { selector: 'td' }).closest('tr') as HTMLElement;
    await user.click(within(linha).getByRole('button', { name: 'Ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Meta' });
    const valor = within(modal).getByLabelText(/Meta projetada/);
    expect(valor).toHaveValue(40);
    await user.clear(valor);
    await user.type(valor, '55');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ metrica: 'LEADS', periodo: '2026-11', valor: 55 });
  });

  it('Excluir pede confirmação antes de chamar a API', async () => {
    let excluida = false;
    const fetchMock = api({
      [`${API}/${ID_1}`]: (init) => {
        if (init?.method === 'DELETE') excluida = true;
        return json(meta());
      },
    });
    const { user } = renderTela(fetchMock);
    await abrirAbaMetas(user);

    const linha = screen.getByText('Leads', { selector: 'td' }).closest('tr') as HTMLElement;
    await user.click(within(linha).getByRole('button', { name: 'Ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(within(confirmacao).getByText(/meta de Leads \(novembro de 2026\)/)).toBeVisible();
    expect(excluida).toBe(false);
    await user.click(within(confirmacao).getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(excluida).toBe(true));
  });

  it('sem permissão de criar, editar e excluir, esconde as ações', async () => {
    const fetchMock = apiFalsa({
      usuario: { ...USUARIO_TESTE, permissoes: ['comercial-atendimento.metas.ver'] },
      rotas: {
        [API]: () => pagina(METAS),
        [`${API}/acompanhamento`]: () => json(ACOMPANHAMENTO),
        [`${API}/responsaveis`]: () => json([]),
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByTestId('resumo-LEADS');
    expect(screen.queryByRole('button', { name: 'Nova Meta' })).not.toBeInTheDocument();

    await abrirAbaMetas(user);
    expect(screen.queryByRole('button', { name: 'Ações' })).not.toBeInTheDocument();
  });

  it('em inglês: textos, trimestre e valores seguem o idioma', async () => {
    const { user } = renderTela(
      api(
        {},
        { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const } },
      ),
    );

    expect(await screen.findByRole('heading', { name: 'Goals' })).toBeVisible();
    const receita = await screen.findByTestId('resumo-RECEITA_NOVA');
    expect(within(receita).getByText('New revenue')).toBeVisible();
    expect(within(receita).getByText(/25,000\.00 of .*20,000\.00/)).toBeVisible();
    expect(within(screen.getByTestId('evolucao-RECEITA_NOVA')).getByText('Q4 2026')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'New Goal' }));
    const modal = await screen.findByRole('dialog', { name: 'New Goal' });
    await user.click(within(modal).getByRole('button', { name: 'Create Goal' }));
    expect(await within(modal).findByText('Value is required.')).toBeVisible();
  });
});
