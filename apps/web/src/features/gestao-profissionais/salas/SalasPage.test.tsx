import type { Sala } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/gestao-profissionais/salas';
const ID_1 = '00000000-0000-4000-8000-0000000000b1';
const ID_2 = '00000000-0000-4000-8000-0000000000b2';
const ID_3 = '00000000-0000-4000-8000-0000000000b3';

function sala(parcial: Partial<Sala>): Sala {
  return {
    id: ID_1,
    nome: 'Sala Azul',
    numero: '01',
    andar: '2º andar',
    tipo: 'CONSULTORIO',
    capacidade: 1,
    metragem: 12.5,
    valorHora: 80,
    valorTurno: 250,
    valorMensal: 3000,
    equipamentos: 'Maca e armário',
    ativo: true,
    emUso: false,
    createdAt: '2026-10-21T12:00:00.000Z',
    updatedAt: '2026-10-21T12:00:00.000Z',
    ...parcial,
  };
}

const SALAS = [
  sala({}),
  sala({
    id: ID_2,
    nome: 'Sala Verde',
    numero: null,
    andar: null,
    tipo: 'REUNIAO',
    metragem: null,
    valorHora: null,
    valorTurno: null,
    valorMensal: null,
    equipamentos: null,
  }),
  sala({ id: ID_3, nome: 'Sala Cinza', ativo: false, emUso: true }),
];

function pagina(data: Sala[]) {
  return json({ data, meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 } });
}

const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;
const ehLeitura = (init?: RequestInit) => !init?.method || init.method === 'GET';

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({ ...rotas, rotas: { [API]: () => pagina(SALAS), ...rotas.rotas } });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/salas', fetchMock) };
}

const card = (nome: string) =>
  screen.getByRole('heading', { name: nome }).closest('li') as HTMLElement;

describe('Gestão de Salas (/salas)', () => {
  it('mostra título, abas e os cards com tipo, número, andar, valor mensal e situação', async () => {
    renderTela();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gestão de Salas' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Controle de aluguel de salas para profissionais')).toBeVisible();
    for (const aba of ['Salas', 'Contratos', 'Mapa Ocupação', 'Dashboard']) {
      expect(screen.getByRole('tab', { name: aba })).toBeVisible();
    }
    expect(screen.getByRole('tab', { name: 'Salas' })).toHaveAttribute('aria-selected', 'true');

    await screen.findByRole('heading', { name: 'Sala Azul' });
    const azul = card('Sala Azul');
    expect(within(azul).getByText('Consultório')).toBeVisible();
    expect(within(azul).getByText('Nº 01')).toBeVisible();
    expect(within(azul).getByText('2º andar')).toBeVisible();
    expect(within(azul).getByText(/3\.000,00/)).toBeVisible();
    expect(within(azul).getByText('Disponível')).toBeVisible();

    const verde = card('Sala Verde');
    expect(within(verde).getByText('Reunião')).toBeVisible();
    expect(within(verde).getByText('-')).toBeVisible();
    expect(within(card('Sala Cinza')).getByText('Inativa')).toBeVisible();
  });

  it('lista vazia mostra o estado vazio', async () => {
    renderTela(api({ rotas: { [API]: () => pagina([]) } }));

    expect(await screen.findByText('Nenhuma sala cadastrada.')).toBeVisible();
  });

  it('erro ao carregar oferece tentar de novo', async () => {
    const { user } = renderTela(api({ rotas: { [API]: () => json({ message: 'x' }, 500) } }));

    expect(await screen.findByText('Não foi possível carregar as salas.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  });

  it('as abas Mapa Ocupação e Dashboard abrem o aviso de etapa futura', async () => {
    const { user } = renderTela();
    await screen.findByText('Sala Azul');

    for (const aba of ['Mapa Ocupação', 'Dashboard']) {
      await user.click(screen.getByRole('tab', { name: aba }));
      expect(screen.getByRole('tab', { name: aba })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Em construção')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Nova Sala' })).not.toBeInTheDocument();
    }
    await user.click(screen.getByRole('tab', { name: 'Salas' }));
    expect(await screen.findByText('Sala Azul')).toBeVisible();
  });

  it('lupa abre os Detalhes da Sala com todos os dados, e Fechar o dispensa', async () => {
    const { user } = renderTela();
    await screen.findByText('Sala Azul');

    await user.click(screen.getByRole('button', { name: 'Detalhes de Sala Azul' }));
    const modal = await screen.findByRole('dialog', { name: 'Detalhes da Sala' });
    const valorDe = (rotulo: string) =>
      within(modal).getByText(rotulo).nextElementSibling as HTMLElement;
    expect(valorDe('Nome')).toHaveTextContent('Sala Azul');
    expect(valorDe('Número')).toHaveTextContent('01');
    expect(valorDe('Andar')).toHaveTextContent('2º andar');
    expect(valorDe('Tipo')).toHaveTextContent('Consultório');
    expect(valorDe('Capacidade')).toHaveTextContent('1');
    expect(valorDe('Metragem')).toHaveTextContent('12,5 m²');
    expect(valorDe('Valor/Hora')).toHaveTextContent('R$ 80,00');
    expect(valorDe('Valor/Turno')).toHaveTextContent('R$ 250,00');
    expect(valorDe('Valor Mensal')).toHaveTextContent('R$ 3.000,00');
    expect(valorDe('Equipamentos')).toHaveTextContent('Maca e armário');
    expect(valorDe('Status')).toHaveTextContent('Ativo');

    const fechar = within(modal)
      .getAllByRole('button', { name: 'Fechar' })
      .find((botao) => botao.dataset.slot !== 'dialog-close') as HTMLElement;
    await user.click(fechar);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Detalhes: campos vazios aparecem como "-" e Editar abre o formulário preenchido', async () => {
    const { user } = renderTela();
    await screen.findByText('Sala Verde');

    await user.click(screen.getByRole('button', { name: 'Detalhes de Sala Verde' }));
    const detalhes = await screen.findByRole('dialog', { name: 'Detalhes da Sala' });
    expect(within(detalhes).getByText('Metragem').nextElementSibling).toHaveTextContent('-');
    expect(within(detalhes).getByText('Valor Mensal').nextElementSibling).toHaveTextContent('-');

    await user.click(within(detalhes).getByRole('button', { name: 'Editar' }));
    const editar = await screen.findByRole('dialog', { name: 'Editar Sala' });
    expect(within(editar).getByLabelText(/^Nome/)).toHaveValue('Sala Verde');
    expect(screen.queryByRole('dialog', { name: 'Detalhes da Sala' })).not.toBeInTheDocument();
  });

  it('Nova Sala: abre com os campos do inventário e valida o nome sem enviar', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Sala Azul');

    await user.click(screen.getByRole('button', { name: 'Nova Sala' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Sala' });
    for (const rotulo of [
      'Número',
      'Andar',
      'm²',
      'R$/Hora',
      'R$/Turno',
      'R$/Mês',
      'Equipamentos',
    ]) {
      expect(within(modal).getByLabelText(rotulo)).toBeVisible();
    }
    expect(within(modal).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Consultório');
    await user.click(within(modal).getByRole('combobox', { name: 'Tipo' }));
    const opcoes = await screen.findAllByRole('option');
    expect(opcoes.map((opcao) => opcao.textContent)).toEqual([
      'Consultório',
      'Procedimento',
      'Exame',
      'Reunião',
      'Outro',
    ]);
    await user.keyboard('{Escape}');

    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Nova Sala: envia o corpo, fecha o modal e recarrega os cards', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (ehLeitura(init)) return pagina(SALAS);
          corpo = corpoDe(init);
          return json(sala({ nome: 'Sala Nova' }), 201);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Sala Azul');

    await user.click(screen.getByRole('button', { name: 'Nova Sala' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Sala' });
    await user.type(within(modal).getByLabelText(/^Nome/), 'Sala Nova');
    await user.type(within(modal).getByLabelText('Número'), '15');
    await user.type(within(modal).getByLabelText('R$/Hora'), '5000');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({
      nome: 'Sala Nova',
      numero: '15',
      andar: null,
      tipo: 'CONSULTORIO',
      metragem: null,
      valorHora: 50,
      valorTurno: null,
      valorMensal: null,
      equipamentos: null,
    });
    expect(chamadasPara(fetchMock, API).filter(([, i]) => ehLeitura(i)).length).toBeGreaterThan(1);
  });

  it('Editar Sala: abre com os valores atuais e envia PATCH', async () => {
    let corpo: Record<string, unknown> = {};
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_1}`]: (init) => {
            corpo = corpoDe(init);
            return json(sala({ nome: 'Sala Azul 2' }));
          },
        },
      }),
    );
    await screen.findByText('Sala Azul');

    await user.click(screen.getByRole('button', { name: 'Editar Sala Azul' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Sala' });
    expect(within(modal).getByLabelText(/^Nome/)).toHaveValue('Sala Azul');
    expect(within(modal).getByLabelText('Número')).toHaveValue('01');
    expect(within(modal).getByLabelText('Equipamentos')).toHaveValue('Maca e armário');
    await user.type(within(modal).getByLabelText(/^Nome/), ' 2');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      nome: 'Sala Azul 2',
      numero: '01',
      tipo: 'CONSULTORIO',
      metragem: 12.5,
      valorHora: 80,
      valorMensal: 3000,
    });
  });

  it('Excluir: abre o modal de confirmação (não alert) e só exclui ao confirmar', async () => {
    const alerta = vi.spyOn(window, 'confirm');
    let excluida = false;
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_2}`]: (init) => {
            excluida = init?.method === 'DELETE';
            return json(sala({ id: ID_2 }));
          },
        },
      }),
    );
    await screen.findByText('Sala Verde');

    await user.click(screen.getByRole('button', { name: 'Excluir Sala Verde' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir sala?' });
    expect(within(dialogo).getByText(/Sala Verde/)).toBeVisible();
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluida).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Excluir Sala Verde' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluida).toBe(true));
    expect(alerta).not.toHaveBeenCalled();
  });

  it('sala com contrato tem a exclusão desabilitada', async () => {
    renderTela();
    await screen.findByText('Sala Cinza');

    expect(screen.getByRole('button', { name: 'Excluir Sala Cinza' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excluir Sala Azul' })).toBeEnabled();
  });
});
