import type { ReceitaProfissional, ResumoReceitaProfissionais } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

// Tela com modais e comboboxes: estoura os 5 s padrão no CI (cobertura).
vi.setConfig({ testTimeout: 20_000 });

const API = '/api/gestao-profissionais/receita-profissionais';
const RESUMO_API = `${API}/resumo`;
const PROFISSIONAL_1 = '00000000-0000-4000-8000-0000000000a1';
const PROFISSIONAL_2 = '00000000-0000-4000-8000-0000000000a2';
const ID_1 = '00000000-0000-4000-8000-0000000000c1';
const ID_2 = '00000000-0000-4000-8000-0000000000c2';

function receita(parcial: Partial<ReceitaProfissional> = {}): ReceitaProfissional {
  return {
    id: ID_1,
    numero: 1,
    descricao: 'Consulta Particular',
    pacienteId: null,
    pacienteNome: 'Paciente Teste',
    profissionalId: PROFISSIONAL_1,
    profissionalNome: 'Dra. Ana Teste',
    valor: '250.00',
    dataVencimento: '2026-10-09',
    formaPagamentoId: null,
    formaPagamentoNome: 'Voucher',
    planoContaId: null,
    planoContaNome: null,
    documento: null,
    totalParcelas: 1,
    status: 'RECEBIDO',
    contaBancariaId: null,
    contaBancariaNome: null,
    dataRecebimento: '2026-10-09',
    observacoes: null,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

const RECEITAS = [
  receita(),
  receita({
    id: ID_2,
    descricao: 'Retorno Pendente',
    pacienteNome: null,
    profissionalId: PROFISSIONAL_2,
    profissionalNome: 'Dr. Beto Teste',
    valor: '100.50',
    dataVencimento: '2099-12-31',
    status: 'PENDENTE',
    dataRecebimento: null,
    formaPagamentoNome: null,
  }),
];

const RESUMO: ResumoReceitaProfissionais = {
  totalRecebido: '17275.00',
  totalPendente: '100.50',
  registros: 59,
  porProfissional: [
    {
      profissionalId: PROFISSIONAL_1,
      profissionalNome: 'Dra. Ana Teste',
      totalRecebido: '600.00',
      registros: 3,
    },
    {
      profissionalId: PROFISSIONAL_2,
      profissionalNome: 'Dr. Beto Teste',
      totalRecebido: '0.00',
      registros: 1,
    },
  ],
};

function pagina(data: ReceitaProfissional[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

function parametros(fetchMock: ReturnType<typeof apiFalsa>, caminho = API) {
  const [url] = chamadasPara(fetchMock, caminho).at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => pagina(RECEITAS),
      [RESUMO_API]: () => json(RESUMO),
      '/api/lookups/profissionais': () => pagina([]),
      '/api/lookups/formas-pagamento': () => pagina([]),
      '/api/lookups/pacientes': () => pagina([]),
      '/api/financeiro/plano-contas': () => json({ data: [], total: 0 }),
      '/api/financeiro/contas-bancarias': () => json({ data: [], total: 0 }),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/receita-profissionais', fetchMock) };
}

async function abrirMenu(user: ReturnType<typeof userEvent.setup>, linha: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
}

describe('Receita Profissionais (/receita-profissionais)', () => {
  it('mostra título, totais, resumo por profissional e as colunas do inventário', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Receita Profissionais' })).toBeVisible();
    const totais = screen.getByRole('region', { name: 'Totais' });
    expect(await within(totais).findByText('R$ 17.275,00')).toBeVisible();
    expect(within(totais).getByText('Total Recebido')).toBeVisible();
    expect(within(totais).getByText('R$ 100,50')).toBeVisible();
    expect(within(totais).getByText('Total Pendente')).toBeVisible();
    expect(within(totais).getByText('59')).toBeVisible();
    expect(within(totais).getByText('Registros')).toBeVisible();

    const resumo = screen.getByRole('region', { name: 'Resumo por Profissional' });
    expect(within(resumo).getByText('Dra. Ana Teste')).toBeVisible();
    expect(within(resumo).getByText('R$ 600,00')).toBeVisible();
    expect(within(resumo).getByText('3 reg.')).toBeVisible();

    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Data',
      'Profissional',
      'Paciente',
      'Descrição',
      'Forma Pgto',
      'Valor',
      'Status',
      'Ações',
    ]);
    expect(screen.getByPlaceholderText('Buscar receitas...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Nov[ao]/ })).not.toBeInTheDocument();
  });

  it('formata data, valor e status; paciente e forma vazios viram "-"', async () => {
    renderTela();

    const l1 = (await screen.findByText('Consulta Particular')).closest('tr') as HTMLElement;
    expect(within(l1).getByText('09/10/2026')).toBeVisible();
    expect(within(l1).getByText('R$ 250,00')).toBeVisible();
    expect(within(l1).getByText('Recebido')).toBeVisible();
    expect(within(l1).getByText('Voucher')).toBeVisible();

    const l2 = screen.getByText('Retorno Pendente').closest('tr') as HTMLElement;
    expect(within(l2).getAllByText('-')).toHaveLength(2);
    expect(within(l2).getByText('Pendente')).toBeVisible();
  });

  it('a busca filtra a lista e os totais com o mesmo texto', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Consulta Particular');

    await user.type(screen.getByPlaceholderText('Buscar receitas...'), 'ana');

    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ search: 'ana' }));
    await waitFor(() => expect(parametros(fetchMock, RESUMO_API)).toMatchObject({ search: 'ana' }));
    expect(parametros(fetchMock, RESUMO_API)).not.toHaveProperty('page');
  });

  it('o período De/Até filtra a lista e os totais', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Consulta Particular');

    await user.type(screen.getByLabelText('Vencimento de:'), '2026-10-01');
    await user.type(screen.getByLabelText('até:'), '2026-10-31');

    const esperado = { vencimentoDe: '2026-10-01', vencimentoAte: '2026-10-31' };
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject(esperado));
    await waitFor(() => expect(parametros(fetchMock, RESUMO_API)).toMatchObject(esperado));
  });

  it('ordena pelas colunas Data, Profissional, Paciente e Valor', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Consulta Particular');

    await user.click(screen.getByRole('button', { name: /Valor/ }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ sort: 'valor:asc' }));
    await user.click(screen.getByRole('button', { name: /Profissional/ }));
    await waitFor(() => expect(parametros(fetchMock)).toMatchObject({ sort: 'profissional:asc' }));
  });

  it('Detalhar abre o detalhe com profissional, paciente e forma de pagamento', async () => {
    const { user } = renderTela();
    await abrirMenu(user, 'Consulta Particular');
    await user.click(await screen.findByRole('menuitem', { name: 'Detalhar' }));

    const modal = await screen.findByRole('dialog', { name: 'Consulta Particular' });
    expect(within(modal).getByText('Dra. Ana Teste')).toBeVisible();
    expect(within(modal).getByText('Paciente Teste')).toBeVisible();
    expect(within(modal).getByText('Voucher')).toBeVisible();
    await user.click(within(modal).getByRole('button', { name: 'Editar' }));
    expect(await screen.findByRole('dialog', { name: 'Editar Receita' })).toBeVisible();
  });

  it('o menu da linha tem Estornar Baixa só para receita recebida', async () => {
    const { user } = renderTela();
    await abrirMenu(user, 'Consulta Particular');
    expect(await screen.findByRole('menuitem', { name: 'Estornar Baixa' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toBeVisible();
    await user.keyboard('{Escape}');

    await abrirMenu(user, 'Retorno Pendente');
    expect(await screen.findByRole('menuitem', { name: 'Detalhar' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Estornar Baixa' })).not.toBeInTheDocument();
  });

  it('Editar: abre com os dados, valida o obrigatório e envia PATCH com o profissional', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_1}`]: (init) => {
          corpo = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return json(receita({ descricao: 'Consulta Corrigida' }));
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await abrirMenu(user, 'Consulta Particular');
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));

    const modal = await screen.findByRole('dialog', { name: 'Editar Receita' });
    const descricao = within(modal).getByLabelText('Descrição');
    expect(descricao).toHaveValue('Consulta Particular');
    await user.clear(descricao);
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    expect(await within(modal).findByText('Descrição é obrigatório.')).toBeVisible();

    await user.type(descricao, 'Consulta Corrigida');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(corpo).toMatchObject({
        descricao: 'Consulta Corrigida',
        profissionalId: PROFISSIONAL_1,
        valor: 250,
        status: 'RECEBIDO',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Editar Receita' })).not.toBeInTheDocument(),
    );
  });

  it('Estornar Baixa pede confirmação e envia POST; os totais são buscados de novo', async () => {
    const fetchMock = api({
      rotas: { [`${API}/${ID_1}/estornar-baixa`]: () => json(receita({ status: 'PENDENTE' })) },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Consulta Particular');
    const antes = chamadasPara(fetchMock, RESUMO_API).length;

    await abrirMenu(user, 'Consulta Particular');
    await user.click(await screen.findByRole('menuitem', { name: 'Estornar Baixa' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(chamadasPara(fetchMock, `${API}/${ID_1}/estornar-baixa`)).toHaveLength(0);
    await user.click(within(dialogo).getByRole('button', { name: 'Estornar Baixa' }));

    await waitFor(() =>
      expect(chamadasPara(fetchMock, `${API}/${ID_1}/estornar-baixa`)[0]?.[1]?.method).toBe('POST'),
    );
    await waitFor(() => expect(chamadasPara(fetchMock, RESUMO_API).length).toBeGreaterThan(antes));
  });

  it('Excluir pede confirmação e envia DELETE; Cancelar não exclui', async () => {
    const fetchMock = api({
      rotas: { [`${API}/${ID_2}`]: () => json(RECEITAS[1]) },
    });
    const { user } = renderTela(fetchMock);

    await abrirMenu(user, 'Retorno Pendente');
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
    let dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText(/Retorno Pendente/)).toBeVisible();
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(chamadasPara(fetchMock, `${API}/${ID_2}`)).toHaveLength(0);

    await abrirMenu(user, 'Retorno Pendente');
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
    dialogo = await screen.findByRole('alertdialog');
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }));
    await waitFor(() =>
      expect(chamadasPara(fetchMock, `${API}/${ID_2}`)[0]?.[1]?.method).toBe('DELETE'),
    );
  });

  it('estado vazio e totais zerados sem receitas', async () => {
    const fetchMock = api({
      rotas: {
        [API]: () => pagina([]),
        [RESUMO_API]: () =>
          json({ totalRecebido: '0.00', totalPendente: '0.00', registros: 0, porProfissional: [] }),
      },
    });
    renderTela(fetchMock);
    expect(await screen.findByText('Nenhuma receita encontrada.')).toBeVisible();
    expect(
      screen.queryByRole('region', { name: 'Resumo por Profissional' }),
    ).not.toBeInTheDocument();
  });

  it('mostra os textos em inglês', async () => {
    renderTela(
      api({
        usuario: {
          ...USUARIO_TESTE,
          preferencias: { ...USUARIO_TESTE.preferencias, idioma: 'en' },
        },
      }),
    );

    expect(await screen.findByRole('heading', { name: 'Professional Revenue' })).toBeVisible();
    const totais = screen.getByRole('region', { name: 'Totals' });
    expect(within(totais).getByText('Total Received')).toBeVisible();
    expect(within(totais).getByText('Total Pending')).toBeVisible();
    expect(within(totais).getByText('Records')).toBeVisible();
    expect(await screen.findByRole('region', { name: 'Summary by Professional' })).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.slice(0, 7).map((c) => c.textContent)).toEqual([
      'Date',
      'Professional',
      'Patient',
      'Description',
      'Payment Method',
      'Amount',
      'Status',
    ]);
    expect(screen.getByPlaceholderText('Search revenue...')).toBeVisible();
    expect(await screen.findByText('Received')).toBeVisible();
  });
});
