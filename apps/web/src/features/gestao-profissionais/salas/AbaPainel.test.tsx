import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, type ApiFalsaOptions } from '@/test/render-app';

vi.setConfig({ testTimeout: 30_000 });

const SALAS = '/api/gestao-profissionais/salas';
const OCUPACAO = `${SALAS}/ocupacao`;
const DASHBOARD = `${SALAS}/dashboard`;
const S1 = '00000000-0000-4000-8000-0000000000a1';
const S2 = '00000000-0000-4000-8000-0000000000a2';
const S10 = '00000000-0000-4000-8000-0000000000a3';
const C1 = '00000000-0000-4000-8000-0000000000b1';
const C2 = '00000000-0000-4000-8000-0000000000b2';
const C3 = '00000000-0000-4000-8000-0000000000b3';

function semana(inicio: string, fim: string, blocosPorSala: Record<string, unknown[]> = {}) {
  return {
    inicio,
    fim,
    salas: [
      { salaId: S1, salaNome: 'Sala 1', blocos: blocosPorSala.S1 ?? [] },
      { salaId: S2, salaNome: 'Sala 2', blocos: blocosPorSala.S2 ?? [] },
      { salaId: S10, salaNome: 'Sala 10', blocos: blocosPorSala.S10 ?? [] },
    ],
  };
}

const bloco = (contratoId: string, data: string, nome: string, inicio: string, fim: string) => ({
  contratoId,
  data,
  locatarioNome: nome,
  inicio,
  fim,
});

function api(rotas: NonNullable<ApiFalsaOptions['rotas']> = {}) {
  return apiFalsa({
    rotas: {
      [SALAS]: () => json({ data: [], meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 } }),
      ...rotas,
    },
  });
}

async function abrirAba(nome: string, fetchMock = api()) {
  const user = userEvent.setup();
  renderApp('/salas', fetchMock);
  await user.click(await screen.findByRole('tab', { name: nome }));
  return { user, fetchMock };
}

beforeEach(() => {
  // Quinta-feira, 22/10/2026: a semana vai de 19/10 a 25/10.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-22T12:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Gestão de Salas: aba Mapa Ocupação', () => {
  const resposta = () =>
    json(
      semana('2026-10-19', '2026-10-25', {
        S2: [
          bloco(C1, '2026-10-20', 'Dra. Ana Teste', '14:00', '18:00'),
          bloco(C2, '2026-10-22', 'Dra. Ana Teste', '08:00', '12:00'),
        ],
        S10: [
          bloco(C2, '2026-10-21', 'Bruno Cliente Teste', '08:00', '12:00'),
          bloco(C3, '2026-10-21', 'Carla Hora Teste', '08:00', '12:00'),
        ],
      }),
    );

  it('mostra a semana de segunda a domingo e consulta a API pela segunda-feira', async () => {
    const { fetchMock } = await abrirAba('Mapa Ocupação', api({ [OCUPACAO]: resposta }));

    expect(await screen.findByText('19/10/2026 - 25/10/2026')).toBeVisible();
    const cabecalhos = screen.getAllByRole('columnheader').map((c) => c.textContent);
    expect(cabecalhos).toEqual([
      'Sala',
      'Seg19/10',
      'Ter20/10',
      'Qua21/10',
      'Qui22/10',
      'Sex23/10',
      'Sáb24/10',
      'Dom25/10',
    ]);
    const consulta = chamadasPara(fetchMock, OCUPACAO).at(-1)?.[0] ?? '';
    expect(new URL(consulta, 'http://x').searchParams.get('inicio')).toBe('2026-10-19');
  });

  it('lista as salas em ordem natural e os blocos com locatário e horário, empilhados no mesmo dia', async () => {
    await abrirAba('Mapa Ocupação', api({ [OCUPACAO]: resposta }));

    await screen.findByText('19/10/2026 - 25/10/2026');
    const linhas = screen.getAllByRole('row').slice(1);
    expect(linhas.map((l) => within(l).getAllByRole('rowheader')[0]?.textContent)).toEqual([
      'Sala 1',
      'Sala 2',
      'Sala 10',
    ]);
    const sala2 = linhas[1] as HTMLElement;
    expect(within(sala2).getByText('14:00-18:00')).toBeVisible();
    expect(within(sala2).getByText('08:00-12:00')).toBeVisible();
    const terca = within(sala2).getByRole('list', { name: 'Sala 2, 20/10/2026' });
    expect(within(terca).getByText('Dra. Ana Teste')).toBeVisible();
    const sala10 = within(linhas[2] as HTMLElement).getByRole('list', {
      name: 'Sala 10, 21/10/2026',
    });
    expect(within(sala10).getAllByRole('listitem')).toHaveLength(2);
    expect(within(sala10).getByText('Bruno Cliente Teste')).toBeVisible();
    expect(within(sala10).getByText('Carla Hora Teste')).toBeVisible();
    expect(within(linhas[0] as HTMLElement).queryByRole('list')).not.toBeInTheDocument();
  });

  it('é só visualização: os blocos não são botões nem links', async () => {
    await abrirAba('Mapa Ocupação', api({ [OCUPACAO]: resposta }));
    await screen.findByText('19/10/2026 - 25/10/2026');

    const tabela = screen.getByRole('table');
    expect(within(tabela).queryByRole('button')).not.toBeInTheDocument();
    expect(within(tabela).queryByRole('link')).not.toBeInTheDocument();
  });

  it('navega entre as semanas e volta com Hoje', async () => {
    const { user, fetchMock } = await abrirAba(
      'Mapa Ocupação',
      api({
        [OCUPACAO]: () => json(semana('2026-10-19', '2026-10-25')),
      }),
    );
    await screen.findByText('19/10/2026 - 25/10/2026');
    const ultima = () =>
      new URL(chamadasPara(fetchMock, OCUPACAO).at(-1)?.[0] ?? '', 'http://x').searchParams.get(
        'inicio',
      );

    await user.click(screen.getByRole('button', { name: 'Próxima semana' }));
    expect(await screen.findByText('26/10/2026 - 01/11/2026')).toBeVisible();
    expect(ultima()).toBe('2026-10-26');

    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));
    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(await screen.findByText('12/10/2026 - 18/10/2026')).toBeVisible();
    expect(ultima()).toBe('2026-10-12');

    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(await screen.findByText('19/10/2026 - 25/10/2026')).toBeVisible();
  });

  it('sem salas mostra o estado vazio e erro oferece tentar de novo', async () => {
    await abrirAba(
      'Mapa Ocupação',
      api({ [OCUPACAO]: () => json({ inicio: '2026-10-19', fim: '2026-10-25', salas: [] }) }),
    );
    expect(await screen.findByText('Nenhuma sala cadastrada.')).toBeVisible();
  });

  it('erro ao carregar oferece tentar de novo', async () => {
    await abrirAba(
      'Mapa Ocupação',
      api({ [OCUPACAO]: () => json({ statusCode: 500, code: 'X', message: 'x' }, 500) }),
    );
    expect(await screen.findByText('Não foi possível carregar o mapa de ocupação.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  });
});

describe('Gestão de Salas: aba Dashboard', () => {
  const dashboard = {
    data: '2026-10-22',
    totalSalas: 12,
    ocupadas: 6,
    disponiveis: 6,
    taxaOcupacao: 50,
    receitaMensalTotal: 9447.5,
    receitaPorSala: [
      { salaId: S2, salaNome: 'Sala 12', valor: 6750 },
      { salaId: S10, salaNome: 'Sala 7', valor: 1740 },
      { salaId: S1, salaNome: 'Sala 1', valor: 0 },
    ],
  };

  it('mostra os indicadores e a receita mensal contratada por sala', async () => {
    await abrirAba('Dashboard', api({ [DASHBOARD]: () => json(dashboard) }));

    const indicador = async (rotulo: string) =>
      (await screen.findByText(rotulo)).nextElementSibling as HTMLElement;
    expect(await indicador('Total Salas')).toHaveTextContent('12');
    expect(await indicador('Ocupadas')).toHaveTextContent('6');
    expect(await indicador('Disponíveis')).toHaveTextContent('6');
    expect(await indicador('Taxa Ocupação')).toHaveTextContent('50,0%');
    expect(
      screen.getByRole('heading', { name: /Receita Mensal Contratada: R\$\s9\.447,50/ }),
    ).toBeVisible();
    const receita = screen.getByRole('heading', { name: /Receita Mensal Contratada/ });
    const itens = within(receita.parentElement as HTMLElement)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(itens).toEqual([
      expect.stringMatching(/^Sala 12R\$\s6\.750,00$/),
      expect.stringMatching(/^Sala 7R\$\s1\.740,00$/),
      expect.stringMatching(/^Sala 1R\$\s0,00$/),
    ]);
  });

  it('erro ao carregar oferece tentar de novo', async () => {
    await abrirAba(
      'Dashboard',
      api({ [DASHBOARD]: () => json({ statusCode: 500, code: 'X', message: 'x' }, 500) }),
    );
    expect(await screen.findByText('Não foi possível carregar o dashboard.')).toBeVisible();
  });
});
