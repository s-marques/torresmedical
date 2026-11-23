import { PERMISSOES, PREFERENCIAS_PADRAO, type ColetaResiduo } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/regulatorio-qualidade/coletas-residuo';
const ID_1 = '00000000-0000-4000-8000-0000000000c1';
const ID_2 = '00000000-0000-4000-8000-0000000000c2';

function coleta(parcial: Partial<ColetaResiduo> = {}): ColetaResiduo {
  return {
    id: ID_1,
    dataColeta: '2026-11-10',
    proximaColeta: '2026-12-10',
    empresaColetora: 'Coletora Fictícia',
    manifestoMtr: 'MTR-001',
    pesoKg: 12.5,
    tipoResiduo: 'INFECTANTE',
    responsavel: 'Responsável Fictício',
    observacoes: null,
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-10T12:00:00.000Z',
    ...parcial,
  };
}

const COLETAS = [
  coleta(),
  coleta({
    id: ID_2,
    dataColeta: '2026-10-05',
    proximaColeta: null,
    empresaColetora: 'Ambiental Teste',
    manifestoMtr: null,
    pesoKg: null,
    tipoResiduo: 'QUIMICO',
    responsavel: null,
  }),
];

type Corpo = Record<string, unknown>;
type Usuario = ReturnType<typeof userEvent.setup>;

function pagina(data: ColetaResiduo[], total = data.length) {
  return json({ data, meta: { page: 1, pageSize: 10, total, totalPages: total > 10 ? 2 : 1 } });
}

function corpoDe(init?: RequestInit): Corpo {
  return JSON.parse(String(init?.body)) as Corpo;
}

function api(extra: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({ ...extra, rotas: { [API]: () => pagina(COLETAS), ...extra.rotas } });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/coletas-residuo', fetchMock), fetchMock };
}

const cabecalhos = () =>
  within(screen.getByRole('table'))
    .getAllByRole('columnheader')
    .map((c) => c.textContent);

const posts = (fetchMock: ReturnType<typeof apiFalsa>) =>
  chamadasPara(fetchMock, API).filter(([, init]) => init?.method === 'POST');

const chamou = (fetchMock: ReturnType<typeof apiFalsa>, trecho: string) =>
  chamadasPara(fetchMock, API).some(([url]) => url.includes(trecho));

async function abrirMenu(user: Usuario, linha: string, item: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

async function abrirNova(user: Usuario, titulo = 'Nova Coleta de Resíduo') {
  await screen.findByText('Coletora Fictícia');
  await user.click(screen.getByRole('button', { name: 'Nova Coleta' }));
  return screen.findByRole('dialog', { name: titulo });
}

async function escolher(user: Usuario, modal: HTMLElement, campo: RegExp, opcao: string) {
  await user.click(within(modal).getByRole('combobox', { name: campo }));
  await user.click(await screen.findByRole('option', { name: opcao }));
}

describe('Coleta Resíduos (/coletas-residuo)', () => {
  it('mostra título, descrição, ações, busca e as colunas do inventário', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Coletas de Resíduo' })).toBeVisible();
    expect(
      screen.getByText('Registro de coletas de resíduos biológicos e manifestos de transporte.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova Coleta' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
    expect(screen.getByPlaceholderText('Buscar coletas...')).toBeVisible();
    await screen.findByText('Coletora Fictícia');
    expect(cabecalhos()).toEqual([
      'Data Coleta',
      'Próxima Coleta',
      'Empresa Coletora',
      'MTR',
      'Peso (kg)',
      'Tipo Resíduo',
      'Responsável',
      'Ações',
    ]);
  });

  it('mostra datas, tipo pelo rótulo e "-" nos campos vazios', async () => {
    renderTela();

    const cheia = (await screen.findByText('Coletora Fictícia')).closest('tr') as HTMLElement;
    for (const texto of ['10/11/2026', '10/12/2026', 'MTR-001', '12.5', 'Infectante']) {
      expect(within(cheia).getByText(texto)).toBeVisible();
    }
    const vazia = screen.getByText('Ambiental Teste').closest('tr') as HTMLElement;
    expect(within(vazia).getByText('05/10/2026')).toBeVisible();
    expect(within(vazia).getByText('Químico')).toBeVisible();
    expect(within(vazia).getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });

  it('mostra o estado vazio', async () => {
    renderTela(api({ rotas: { [API]: () => pagina([]) } }));
    expect(await screen.findByText('Nenhuma coleta encontrada.')).toBeVisible();
  });

  it('a busca envia search para a API', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Coletora Fictícia');

    await user.type(screen.getByPlaceholderText('Buscar coletas...'), 'mtr-001');

    await waitFor(() => expect(chamou(fetchMock, 'search=mtr-001')).toBe(true));
  });

  it('ordena por cada coluna do inventário', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Coletora Fictícia');

    for (const [coluna, campo] of [
      ['Data Coleta', 'dataColeta'],
      ['Próxima Coleta', 'proximaColeta'],
      ['Empresa Coletora', 'empresaColetora'],
      ['MTR', 'manifestoMtr'],
      ['Peso (kg)', 'pesoKg'],
      ['Tipo Resíduo', 'tipoResiduo'],
      ['Responsável', 'responsavel'],
    ] as const) {
      await user.click(within(screen.getByRole('table')).getByRole('button', { name: coluna }));
      await waitFor(() => expect(chamou(fetchMock, `sort=${campo}`)).toBe(true));
    }
  });

  it('paginação: próxima página chama a API com page=2', async () => {
    const { user, fetchMock } = renderTela(api({ rotas: { [API]: () => pagina(COLETAS, 25) } }));
    await screen.findByText('Coletora Fictícia');

    await user.click(screen.getByRole('button', { name: 'Ir para próxima página' }));

    await waitFor(() => expect(chamou(fetchMock, 'page=2')).toBe(true));
  });

  it('Colunas lista as sete colunas do inventário e permite ocultar uma', async () => {
    const { user } = renderTela();
    await screen.findByText('Coletora Fictícia');

    await user.click(screen.getByRole('button', { name: 'Colunas' }));
    const itens = await screen.findAllByRole('menuitemcheckbox');
    expect(itens.map((i) => i.textContent)).toEqual([
      'Data Coleta',
      'Próxima Coleta',
      'Empresa Coletora',
      'MTR',
      'Peso (kg)',
      'Tipo Resíduo',
      'Responsável',
    ]);
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'MTR' }));
    await user.keyboard('{Escape}');

    await waitFor(() => expect(cabecalhos()).not.toContain('MTR'));
  });

  it('Nova Coleta: campos do print, Tipo com as três opções e asterisco nos obrigatórios', async () => {
    const { user } = renderTela();
    const modal = await abrirNova(user);

    for (const campo of [
      'Próxima Coleta',
      'Empresa Coletora',
      'Manifesto MTR',
      'Peso (kg)',
      'Responsável',
      'Observações',
    ]) {
      expect(within(modal).getByLabelText(campo)).toBeVisible();
    }
    expect(within(modal).getByLabelText(/Data Coleta/)).toBeRequired();
    expect(within(modal).getByRole('combobox', { name: /Tipo Resíduo/ })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Registrar' })).toBeVisible();

    await user.click(within(modal).getByRole('combobox', { name: /Tipo Resíduo/ }));
    const opcoes = await screen.findAllByRole('option');
    expect(opcoes.map((o) => o.textContent)).toEqual(['Infectante', 'Perfurocortante', 'Químico']);
  });

  it('Nova Coleta: vazio mostra as mensagens de obrigatório e não envia', async () => {
    const { user, fetchMock } = renderTela();
    const modal = await abrirNova(user);

    await user.click(within(modal).getByRole('button', { name: 'Registrar' }));

    expect(await within(modal).findByText('Data Coleta é obrigatória.')).toBeVisible();
    expect(within(modal).getByText('Tipo Resíduo é obrigatório.')).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('Nova Coleta: só os obrigatórios enviam os demais campos como null', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [API]: (init) => {
            if (init?.method !== 'POST') return pagina(COLETAS);
            corpo = corpoDe(init);
            return json(coleta(), 201);
          },
        },
      }),
    );
    const modal = await abrirNova(user);

    await user.type(within(modal).getByLabelText(/Data Coleta/), '2026-11-20');
    await escolher(user, modal, /Tipo Resíduo/, 'Perfurocortante');
    await user.click(within(modal).getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      dataColeta: '2026-11-20',
      proximaColeta: null,
      empresaColetora: null,
      manifestoMtr: null,
      pesoKg: null,
      tipoResiduo: 'PERFUROCORTANTE',
      responsavel: null,
      observacoes: null,
    });
  });

  it('Nova Coleta: envia todos os campos, fecha o modal e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const { user, fetchMock } = renderTela(
      api({
        rotas: {
          [API]: (init) => {
            if (init?.method !== 'POST') return pagina(COLETAS);
            corpo = corpoDe(init);
            return json(coleta(), 201);
          },
        },
      }),
    );
    const modal = await abrirNova(user);

    await user.type(within(modal).getByLabelText(/Data Coleta/), '2026-11-20');
    await user.type(within(modal).getByLabelText('Próxima Coleta'), '2026-12-20');
    await user.type(within(modal).getByLabelText('Empresa Coletora'), 'Coletora Nova');
    await user.type(within(modal).getByLabelText('Manifesto MTR'), 'MTR-900');
    await user.type(within(modal).getByLabelText('Peso (kg)'), '42.5');
    await escolher(user, modal, /Tipo Resíduo/, 'Químico');
    await user.type(within(modal).getByLabelText('Responsável'), 'Pessoa Teste');
    await user.type(within(modal).getByLabelText('Observações'), 'Coleta mensal');
    await user.click(within(modal).getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      dataColeta: '2026-11-20',
      proximaColeta: '2026-12-20',
      empresaColetora: 'Coletora Nova',
      manifestoMtr: 'MTR-900',
      pesoKg: 42.5,
      tipoResiduo: 'QUIMICO',
      responsavel: 'Pessoa Teste',
      observacoes: 'Coleta mensal',
    });
    await waitFor(() =>
      expect(
        chamadasPara(fetchMock, API).filter(([, i]) => !i?.method || i.method === 'GET').length,
      ).toBeGreaterThan(1),
    );
  });

  it('Cancelar fecha o modal sem enviar', async () => {
    const { user, fetchMock } = renderTela();
    const modal = await abrirNova(user);

    await user.click(within(modal).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('menu ⋯ tem Editar e Excluir; Editar abre com os dados e envia PATCH com Salvar', async () => {
    let corpo: Corpo = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: (init) => {
            corpo = corpoDe(init);
            return json(coleta({ id: ID_2 }));
          },
        },
      }),
    );

    await abrirMenu(user, 'Ambiental Teste', 'Editar');
    const modal = await screen.findByRole('dialog', { name: 'Editar Coleta de Resíduo' });
    expect(within(modal).getByLabelText(/Data Coleta/)).toHaveValue('2026-10-05');
    expect(within(modal).getByRole('combobox', { name: /Tipo Resíduo/ })).toHaveTextContent(
      'Químico',
    );
    const empresa = within(modal).getByLabelText('Empresa Coletora');
    expect(empresa).toHaveValue('Ambiental Teste');
    await user.clear(empresa);
    await user.type(empresa, 'Ambiental Norte');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      dataColeta: '2026-10-05',
      empresaColetora: 'Ambiental Norte',
      tipoResiduo: 'QUIMICO',
      proximaColeta: null,
      pesoKg: null,
    });
  });

  it('Excluir: confirma antes e envia DELETE; Cancelar não exclui', async () => {
    let excluidos = 0;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: () => {
            excluidos += 1;
            return json(coleta());
          },
        },
      }),
    );

    await abrirMenu(user, 'Coletora Fictícia', 'Excluir');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Coleta' });
    expect(dialogo).toHaveTextContent(
      'Tem certeza que deseja excluir a coleta de 10/11/2026? Esta ação não pode ser desfeita.',
    );
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluidos).toBe(0);

    await abrirMenu(user, 'Coletora Fictícia', 'Excluir');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluidos).toBe(1));
  });

  it('sem permissão de criar, editar, excluir e exportar, esconde os botões e as ações', async () => {
    const somenteVer = PERMISSOES.filter((p) => p === 'regulatorio-qualidade.coleta-residuos.ver');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: somenteVer } }));

    await screen.findByText('Coletora Fictícia');

    expect(screen.queryByRole('button', { name: 'Nova Coleta' })).not.toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Waste Collections' })).toBeVisible();
    await screen.findByText('Coletora Fictícia');
    expect(cabecalhos()).toEqual([
      'Collection Date',
      'Next Collection',
      'Collection Company',
      'MTR',
      'Weight (kg)',
      'Waste Type',
      'Person in Charge',
      'Actions',
    ]);
    expect(screen.getByText('Infectious')).toBeVisible();
    expect(screen.getByPlaceholderText('Search collections...')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'New Collection' }));
    const modal = await screen.findByRole('dialog', { name: 'New Waste Collection' });
    expect(within(modal).getByLabelText('MTR Manifest')).toBeVisible();
    await user.click(within(modal).getByRole('button', { name: 'Register' }));

    expect(await within(modal).findByText('Collection Date is required.')).toBeVisible();
    expect(within(modal).getByText('Waste Type is required.')).toBeVisible();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('em espanhol traduz o título e os tipos', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'es' as const },
    };
    renderTela(api({ usuario }));

    expect(await screen.findByRole('heading', { name: 'Recolecciones de Residuos' })).toBeVisible();
    expect(await screen.findByText('Infeccioso')).toBeVisible();
  });
});
