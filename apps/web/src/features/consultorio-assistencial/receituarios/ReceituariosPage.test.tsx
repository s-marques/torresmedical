import type { Prescricao, ReceituarioBloco } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { USUARIO_TESTE, apiFalsa, chamadasPara, json, renderApp } from '@/test/render-app';
import { hojeLocal, rotuloBloco } from './formatacao';

// Tela com modais e comboboxes: estoura os 5 s padrão no CI (cobertura).
vi.setConfig({ testTimeout: 20_000 });

const BLOCOS = '/api/consultorio-assistencial/receituarios/blocos';
const DISPONIVEIS = `${BLOCOS}/disponiveis`;
const PRESCRICOES = '/api/consultorio-assistencial/receituarios/prescricoes';
const MEDICO = '00000000-0000-4000-8000-0000000000a1';
const PACIENTE = '00000000-0000-4000-8000-0000000000b1';
const BLOCO_1 = '00000000-0000-4000-8000-0000000000c1';
const BLOCO_2 = '00000000-0000-4000-8000-0000000000c2';

function bloco(parcial: Partial<ReceituarioBloco> = {}): ReceituarioBloco {
  return {
    id: BLOCO_1,
    tipo: 'AMARELA',
    numeroInicio: 1,
    numeroFim: 20,
    localizacao: 'Gaveta B',
    profissionalId: MEDICO,
    profissionalNome: 'Dra. Teste',
    dataRecebimento: '2026-11-10',
    usados: 5,
    total: 20,
    status: 'ATIVO',
    createdAt: '2026-11-18T12:00:00.000Z',
    updatedAt: '2026-11-18T12:00:00.000Z',
    ...parcial,
  };
}

const LISTA_BLOCOS = [
  bloco(),
  bloco({
    id: BLOCO_2,
    tipo: 'BRANCA',
    numeroInicio: 100,
    numeroFim: 101,
    localizacao: null,
    profissionalId: null,
    profissionalNome: null,
    usados: 2,
    total: 2,
    status: 'FINALIZADO',
  }),
];

const PRESCRICAO: Prescricao = {
  id: '00000000-0000-4000-8000-0000000000d1',
  numero: 6,
  tipo: 'AZUL',
  blocoId: BLOCO_1,
  pacienteId: PACIENTE,
  pacienteNome: 'Paciente Teste',
  profissionalId: MEDICO,
  profissionalNome: 'Dra. Teste',
  atendimentoId: null,
  medicacao: 'Medicamento X 10mg',
  posologia: '1 comprimido à noite',
  dataPrescricao: '2026-11-15',
  createdAt: '2026-11-15T12:00:00.000Z',
};

const META = { page: 1, pageSize: 10, total: 2, totalPages: 1 };

const lookup = (data: { id: string; label: string }[]) =>
  json({ data: data.map((d) => ({ ...d, descricao: null })), meta: META });

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [BLOCOS]: () => json({ data: LISTA_BLOCOS, meta: META }),
      [DISPONIVEIS]: () => json([bloco()]),
      [PRESCRICOES]: () => json({ data: [PRESCRICAO], meta: { ...META, total: 1 } }),
      '/api/lookups/profissionais': () => lookup([{ id: MEDICO, label: 'Dra. Teste' }]),
      '/api/lookups/pacientes': () => lookup([{ id: PACIENTE, label: 'Paciente Teste' }]),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api(), caminho = '/receituarios') {
  return { user: userEvent.setup(), ...renderApp(caminho, fetchMock) };
}

function parametros(fetchMock: ReturnType<typeof apiFalsa>, url: string) {
  const [ultima] = chamadasPara(fetchMock, url)
    .filter(([, init]) => !init?.method || init.method === 'GET')
    .at(-1) ?? [''];
  return Object.fromEntries(new URL(ultima, 'http://x').searchParams);
}

const enviados = (fetchMock: ReturnType<typeof apiFalsa>, url: string) =>
  chamadasPara(fetchMock, url).filter(([, init]) => init?.method === 'POST');

describe('Receituários (/receituarios)', () => {
  it('mostra título, abas, filtros e as colunas de Blocos do inventário', async () => {
    renderTela();
    expect(await screen.findByRole('heading', { name: 'Receituarios ANVISA' })).toBeVisible();
    expect(
      screen.getByText('Controle de blocos e prescricoes de receituarios controlados.'),
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Blocos', selected: true })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Prescricoes' })).toBeVisible();
    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Tipo',
      'Numeracao',
      'Localizacao',
      'Medico',
      'Usados/Total',
      'Status',
    ]);
    expect(screen.getByPlaceholderText('Buscar blocos...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Bloco' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Colunas' })).toBeVisible();
  });

  it('formata tipo, numeração, médico, usados/total e status', async () => {
    renderTela();
    const linha = (await screen.findByText('Gaveta B')).closest('tr') as HTMLElement;
    expect(within(linha).getByText('Amarela (A)')).toBeVisible();
    expect(within(linha).getByText('000001 - 000020')).toBeVisible();
    expect(within(linha).getByText('Dra. Teste')).toBeVisible();
    expect(within(linha).getByText('5/20')).toBeVisible();
    expect(within(linha).getByText('Ativo')).toBeVisible();
    const outra = screen.getByText('000100 - 000101').closest('tr') as HTMLElement;
    expect(within(outra).getByText('Finalizado')).toBeVisible();
    expect(within(outra).getByText('2/2')).toBeVisible();
  });

  it('busca, filtros de tipo e status e ordenação chamam a API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Gaveta B');
    expect(parametros(fetchMock, BLOCOS)).toMatchObject({ page: '1', pageSize: '10' });

    await user.type(screen.getByPlaceholderText('Buscar blocos...'), 'gaveta');
    await waitFor(() => expect(parametros(fetchMock, BLOCOS)).toMatchObject({ search: 'gaveta' }));

    await user.click(screen.getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Azul' }));
    await waitFor(() => expect(parametros(fetchMock, BLOCOS)).toMatchObject({ tipo: 'AZUL' }));

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: 'Finalizado' }));
    await waitFor(() =>
      expect(parametros(fetchMock, BLOCOS)).toMatchObject({ status: 'FINALIZADO' }),
    );

    await user.click(screen.getByRole('button', { name: /Medico/ }));
    await waitFor(() => expect(parametros(fetchMock, BLOCOS).sort).toMatch(/^medico:/));
  });

  it('Novo Bloco: campos do print e mensagens de obrigatório; não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await user.click(await screen.findByRole('button', { name: 'Novo Bloco' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Bloco de Receituario' });
    expect(within(modal).getByRole('combobox', { name: /Tipo/ })).toHaveTextContent('Amarela (A)');
    expect(within(modal).getByLabelText(/Localizacao/)).toHaveAttribute(
      'placeholder',
      'Ex: Consultorio 1, Gaveta B',
    );
    expect(within(modal).getByRole('combobox', { name: /Medico/ })).toBeVisible();
    expect(within(modal).getByLabelText('Data Recebimento')).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeVisible();

    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));
    expect(await within(modal).findByText('Número início é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Número fim é obrigatório.')).toBeVisible();
    expect(enviados(fetchMock, BLOCOS)).toHaveLength(0);

    await user.type(within(modal).getByRole('spinbutton', { name: /Numero Inicio/ }), '30');
    await user.type(within(modal).getByRole('spinbutton', { name: /Numero Fim/ }), '10');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));
    expect(
      await within(modal).findByText('Número fim deve ser maior ou igual ao início'),
    ).toBeVisible();
    expect(enviados(fetchMock, BLOCOS)).toHaveLength(0);
  });

  it('Novo Bloco: envia o POST com o médico escolhido e fecha', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [BLOCOS]: (init) => {
          if (init?.method !== 'POST') return json({ data: LISTA_BLOCOS, meta: META });
          corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
          return json(bloco(), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await user.click(await screen.findByRole('button', { name: 'Novo Bloco' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Bloco de Receituario' });

    await user.click(within(modal).getByRole('combobox', { name: /Tipo/ }));
    await user.click(await screen.findByRole('option', { name: 'Azul (B)' }));
    await user.type(within(modal).getByRole('spinbutton', { name: /Numero Inicio/ }), '1');
    await user.type(within(modal).getByRole('spinbutton', { name: /Numero Fim/ }), '20');
    await user.type(within(modal).getByLabelText(/Localizacao/), 'Armario 2');
    await user.click(within(modal).getByRole('combobox', { name: /Medico/ }));
    await user.click(await screen.findByRole('option', { name: /Dra. Teste/ }));
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Novo Bloco de Receituario' })).toBeNull(),
    );
    expect(corpo).toMatchObject({
      tipo: 'AZUL',
      numeroInicio: 1,
      numeroFim: 20,
      localizacao: 'Armario 2',
      profissionalId: MEDICO,
    });
  });

  it('aba Prescricoes: colunas, filtros de tipo e período e o botão Nova Prescricao', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await user.click(await screen.findByRole('tab', { name: 'Prescricoes' }));
    const tabela = await screen.findByRole('table');
    await within(tabela).findByText('Medicamento X 10mg');
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['N Receita', 'Tipo', 'Paciente', 'Medico', 'Medicacao', 'Data']);
    const linha = screen.getByText('Medicamento X 10mg').closest('tr') as HTMLElement;
    expect(within(linha).getByText('000006')).toBeVisible();
    expect(within(linha).getByText('Azul (B)')).toBeVisible();
    expect(within(linha).getByText('15/11/2026')).toBeVisible();
    expect(screen.getByPlaceholderText('Buscar prescricoes...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova Prescricao' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Novo Bloco' })).toBeNull();

    await user.click(screen.getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Amarela' }));
    await waitFor(() =>
      expect(parametros(fetchMock, PRESCRICOES)).toMatchObject({ tipo: 'AMARELA' }),
    );
    await user.type(screen.getByLabelText('Data de:'), '2026-11-01');
    await waitFor(() =>
      expect(parametros(fetchMock, PRESCRICOES)).toMatchObject({ de: '2026-11-01' }),
    );
    await user.click(screen.getByRole('button', { name: /Paciente/ }));
    await waitFor(() => expect(parametros(fetchMock, PRESCRICOES).sort).toMatch(/^paciente:/));
  });

  it('Nova Prescricao: mensagens de obrigatório e envio com bloco e paciente', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [PRESCRICOES]: (init) => {
          if (init?.method !== 'POST') return json({ data: [PRESCRICAO], meta: META });
          corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
          return json(PRESCRICAO, 201);
        },
      },
    });
    const { user } = renderTela(fetchMock, '/receituarios?aba=prescricoes');
    await user.click(await screen.findByRole('button', { name: 'Nova Prescricao' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Prescricao' });
    expect(within(modal).getByLabelText('Data da Prescricao')).toHaveValue(hojeLocal());

    await user.click(within(modal).getByRole('button', { name: 'Prescrever' }));
    expect(await within(modal).findByText('Bloco é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Paciente é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Medicação é obrigatória.')).toBeVisible();
    expect(enviados(fetchMock, PRESCRICOES)).toHaveLength(0);

    await user.click(within(modal).getByRole('combobox', { name: /Bloco/ }));
    await user.click(await screen.findByRole('option', { name: rotuloBloco(bloco()) }));
    await user.click(within(modal).getByRole('combobox', { name: /Paciente/ }));
    await user.click(await screen.findByRole('option', { name: /Paciente Teste/ }));
    await user.type(within(modal).getByLabelText(/Medicacao/), 'Medicamento Y');
    await user.type(within(modal).getByLabelText(/Posologia/), '2x ao dia');
    await user.click(within(modal).getByRole('button', { name: 'Prescrever' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nova Prescricao' })).toBeNull(),
    );
    expect(corpo).toMatchObject({
      blocoId: BLOCO_1,
      pacienteId: PACIENTE,
      medicacao: 'Medicamento Y',
      posologia: '2x ao dia',
      dataPrescricao: hojeLocal(),
    });
    expect(await screen.findByText('Prescrição nº 000006 registrada.')).toBeVisible();
  });

  it('Nova Prescricao sem blocos disponíveis avisa para cadastrar um bloco', async () => {
    const fetchMock = api({ rotas: { [DISPONIVEIS]: () => json([]) } });
    const { user } = renderTela(fetchMock, '/receituarios?aba=prescricoes');
    await user.click(await screen.findByRole('button', { name: 'Nova Prescricao' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Prescricao' });
    expect(
      await within(modal).findByText(
        'Nenhum bloco ativo com médico definido. Cadastre um bloco na aba Blocos.',
      ),
    ).toBeVisible();
  });

  it('sem permissão de criar, não mostra Novo Bloco', async () => {
    const fetchMock = api({
      usuario: {
        ...USUARIO_TESTE,
        permissoes: ['consultorio-assistencial.receituarios.ver'],
      },
    });
    renderTela(fetchMock);
    await screen.findByText('Gaveta B');
    expect(screen.queryByRole('button', { name: 'Novo Bloco' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Exportar' })).toBeNull();
  });

  it('rotuloBloco mostra tipo, numeração, médico e uso', () => {
    expect(rotuloBloco(bloco())).toBe('Amarela (A) · 000001 - 000020 · Dra. Teste (5/20)');
    expect(rotuloBloco(bloco({ profissionalNome: null }))).toContain('Sem médico');
    expect(hojeLocal(new Date(2026, 10, 9, 12))).toBe('2026-11-09');
  });
});
