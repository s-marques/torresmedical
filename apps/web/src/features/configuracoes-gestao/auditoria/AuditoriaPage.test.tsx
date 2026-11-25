import { PERMISSOES, PREFERENCIAS_PADRAO, type AuditLogItem } from '@torres/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/auditoria';
const ENTIDADES = `${API}/entidades`;
const META = { page: 1, pageSize: 10, total: 4, totalPages: 1 };

function item(parcial: Partial<AuditLogItem> = {}): AuditLogItem {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    userId: '00000000-0000-4000-8000-0000000000b1',
    userNome: 'Maria Auditora',
    occurredAt: '2026-11-10T15:30:00.000Z',
    action: 'UPDATE',
    entity: 'ContratoSala',
    entityId: 'contrato-1',
    before: { valorUnitario: '100', permuta: false, dataFim: null, updatedAt: 'a' },
    after: { valorUnitario: '150', permuta: true, dataFim: '2027-01-31', updatedAt: 'b' },
    campos: ['valorUnitario', 'permuta', 'dataFim'],
    restrito: false,
    requestId: 'req-123',
    ip: '10.0.0.1',
    ...parcial,
  };
}

const CONTRATO = item();
const CLINICO = item({
  id: '00000000-0000-4000-8000-0000000000a2',
  entity: 'Atendimento',
  entityId: 'atendimento-1',
  before: null,
  after: null,
  campos: ['queixa', 'conduta'],
  restrito: true,
});
const EXCLUSAO = item({
  id: '00000000-0000-4000-8000-0000000000a3',
  userNome: null,
  userId: 'system',
  action: 'DELETE',
  entity: 'ContaReceber',
  entityId: 'conta-1',
  before: { valor: '90', status: 'ABERTA' },
  after: null,
  campos: ['valor', 'status'],
});
const LISTA = [CONTRATO, CLINICO, EXCLUSAO];

const pagina = (data: unknown[]) => json({ data, meta: { ...META, total: data.length } });

function api(extra: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...extra,
    rotas: {
      [API]: () => pagina(LISTA),
      [ENTIDADES]: () => json({ data: ['Atendimento', 'ContaReceber', 'ContratoSala'] }),
      '/api/lookups/usuarios': () =>
        json({
          data: [{ id: CONTRATO.userId, label: 'Maria Auditora', descricao: null }],
          meta: META,
        }),
      ...extra.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/gestao/auditoria', fetchMock), fetchMock };
}

const cabecalhos = () =>
  within(screen.getByRole('table'))
    .getAllByRole('columnheader')
    .map((c) => c.textContent);

const chamou = (fetchMock: ReturnType<typeof apiFalsa>, url: string, trecho: string) =>
  chamadasPara(fetchMock, url).some(([chamada]) => chamada.includes(trecho));

const linhaDe = async (texto: string) =>
  (await screen.findByText(texto)).closest('tr') as HTMLElement;

describe('Auditoria (/gestao/auditoria)', () => {
  it('mostra título, busca, atalhos de eventos, exportação e as colunas', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Auditoria' })).toBeVisible();
    expect(screen.getByPlaceholderText('Buscar entidade ou id do registro...')).toBeVisible();
    for (const chip of [
      'Todos',
      'Exclusões',
      'Cancelamentos',
      'Descontos',
      'Financeiro',
      'Agenda',
      'Sala',
      'Contrato',
      'Prontuário',
    ]) {
      expect(screen.getByRole('button', { name: chip })).toBeVisible();
    }
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    await screen.findByText('conta-1');
    expect(cabecalhos()).toEqual([
      'Data/hora',
      'Usuário',
      'Ação',
      'Entidade',
      'Registro',
      'Campos alterados',
      'Ações',
    ]);
  });

  it('mostra quem, ação, entidade, registro e campos; usuário do sistema pelo id', async () => {
    renderTela();

    const contrato = await linhaDe('contrato-1');
    for (const texto of ['Maria Auditora', 'Alteração', 'Contrato de sala']) {
      expect(within(contrato).getByText(texto)).toBeVisible();
    }
    expect(within(contrato).getByText('valorUnitario, permuta, dataFim')).toBeVisible();
    const exclusao = await linhaDe('conta-1');
    expect(within(exclusao).getByText('system')).toBeVisible();
    expect(within(exclusao).getByText('Exclusão')).toBeVisible();
  });

  it('registro clínico restrito mostra o cadeado no lugar dos campos', async () => {
    renderTela();

    const clinico = await linhaDe('atendimento-1');

    expect(within(clinico).getByText('Conteúdo clínico restrito')).toBeVisible();
    expect(within(clinico).queryByText('queixa, conduta')).not.toBeInTheDocument();
  });

  it('mostra o estado vazio', async () => {
    renderTela(api({ rotas: { [API]: () => pagina([]) } }));

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeVisible();
  });

  it('busca, atalho, ação e id do registro vão para a API', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('conta-1');

    await user.type(screen.getByPlaceholderText('Buscar entidade ou id do registro...'), 'conta');
    await waitFor(() => expect(chamou(fetchMock, API, 'search=conta')).toBe(true));

    await user.click(screen.getByRole('button', { name: 'Contrato' }));
    await waitFor(() => expect(chamou(fetchMock, API, 'grupo=contrato')).toBe(true));

    await user.click(screen.getByRole('combobox', { name: 'Ação' }));
    await user.click(await screen.findByRole('option', { name: 'Exclusão' }));
    await waitFor(() => expect(chamou(fetchMock, API, 'action=DELETE')).toBe(true));

    await user.type(screen.getByRole('searchbox', { name: 'Id do registro' }), 'abc-1');
    await waitFor(() => expect(chamou(fetchMock, API, 'entityId=abc-1')).toBe(true));
  });

  it('filtra por entidade (opções vindas da API, com rótulo) e por usuário', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('conta-1');

    await user.click(screen.getByRole('combobox', { name: 'Entidade' }));
    expect(await screen.findByRole('option', { name: 'Conta a receber' })).toBeVisible();
    await user.click(screen.getByRole('option', { name: 'Contrato de sala' }));
    await waitFor(() => expect(chamou(fetchMock, API, 'entity=ContratoSala')).toBe(true));

    await user.click(screen.getByRole('combobox', { name: 'Usuário' }));
    await user.click(await screen.findByRole('option', { name: /Maria Auditora/ }));
    await waitFor(() => expect(chamou(fetchMock, API, `userId=${CONTRATO.userId}`)).toBe(true));
  });

  it('filtra por período (De/Até) e ordena pelas colunas', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('conta-1');

    fireEvent.change(screen.getByLabelText('Período de:'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('até:'), { target: { value: '2026-11-30' } });
    await waitFor(() => expect(chamou(fetchMock, API, 'ate=2026-11-30')).toBe(true));
    expect(chamou(fetchMock, API, 'de=2026-11-01')).toBe(true);

    for (const [coluna, campo] of [
      ['Data/hora', 'occurredAt'],
      ['Ação', 'action'],
      ['Entidade', 'entity'],
    ] as const) {
      await user.click(within(screen.getByRole('table')).getByRole('button', { name: coluna }));
      await waitFor(() => expect(chamou(fetchMock, API, `sort=${campo}`)).toBe(true));
    }
  });

  it('o clique na linha abre o diff campo a campo da alteração de contrato', async () => {
    const { user } = renderTela();

    await user.click(await linhaDe('contrato-1'));

    const modal = await screen.findByRole('dialog', { name: 'Detalhe do registro' });
    expect(within(modal).getByText('Maria Auditora')).toBeVisible();
    expect(within(modal).getByText('10.0.0.1')).toBeVisible();
    const linhas = within(modal)
      .getAllByRole('row')
      .slice(1)
      .map((linha) => [...linha.children].map((c) => c.textContent));
    expect(linhas).toEqual([
      ['Valor unitário', '100', '150'],
      ['Permuta', 'Não', 'Sim'],
      ['Data de término', '-', '31/01/2027'],
    ]);
    expect(within(modal).queryByText('updatedAt')).not.toBeInTheDocument();

    // O modal tem o botão do rodapé e o X do canto, ambos "Fechar".
    await user.click(within(modal).getAllByRole('button', { name: 'Fechar' })[0] as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('o menu da linha tem "Ver detalhes"; na exclusão, o depois fica vazio', async () => {
    const { user } = renderTela();

    const exclusao = await linhaDe('conta-1');
    await user.click(within(exclusao).getByRole('button', { name: 'Ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ver detalhes' }));

    const modal = await screen.findByRole('dialog', { name: 'Detalhe do registro' });
    const valor = within(modal)
      .getByRole('rowheader', { name: 'Valor' })
      .closest('tr') as HTMLElement;
    expect(
      within(valor)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['90', '-']);
  });

  it('registro clínico restrito mostra o aviso e só os nomes dos campos, sem conteúdo', async () => {
    const { user } = renderTela();

    await user.click(await linhaDe('atendimento-1'));

    const modal = await screen.findByRole('dialog', { name: 'Detalhe do registro' });
    expect(within(modal).getByRole('note')).toHaveTextContent('Conteúdo clínico restrito');
    expect(within(modal).getByRole('note')).toHaveTextContent('queixa, conduta');
    expect(within(modal).queryByRole('table')).not.toBeInTheDocument();
  });

  it('sem a permissão de exportar, esconde o botão Exportar', async () => {
    const semExportar = PERMISSOES.filter((p) => p !== 'configuracoes-gestao.auditoria.exportar');
    renderTela(api({ usuario: { ...USUARIO_TESTE, permissoes: semExportar } }));

    await screen.findByText('conta-1');

    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
  });

  it('em inglês: textos da tela, das ações e do detalhe traduzidos', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    const { user } = renderTela(api({ usuario }));

    expect(await screen.findByRole('heading', { name: 'Audit' })).toBeVisible();
    await screen.findByText('conta-1');
    expect(cabecalhos()).toEqual([
      'Date/time',
      'User',
      'Action',
      'Entity',
      'Record',
      'Changed fields',
      'Actions',
    ]);
    expect(screen.getByRole('button', { name: 'Deletions' })).toBeVisible();
    const contrato = await linhaDe('contrato-1');
    expect(within(contrato).getByText('Room contract')).toBeVisible();

    await user.click(contrato);

    const modal = await screen.findByRole('dialog', { name: 'Record details' });
    expect(within(modal).getByRole('rowheader', { name: 'Unit price' })).toBeVisible();
    expect(within(modal).getByText('Yes')).toBeVisible();
  });
});
