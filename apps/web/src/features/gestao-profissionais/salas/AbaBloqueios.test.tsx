import type { SalaBloqueio } from '@torres/shared';
import { PREFERENCIAS_PADRAO } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MOTIVO_ID, MOTIVO_OUTRO_ID, rotaMotivosCancelamento } from '@/test/motivos-cancelamento';
import {
  apiFalsa,
  chamadasPara,
  json,
  renderApp,
  USUARIO_TESTE,
  type ApiFalsaOptions,
} from '@/test/render-app';

vi.setConfig({ testTimeout: 30_000 });

const SALAS = '/api/gestao-profissionais/salas';
const BLOQUEIOS = '/api/gestao-profissionais/salas-bloqueios';
const SALA_1 = '00000000-0000-4000-8000-0000000000a1';
const SALA_2 = '00000000-0000-4000-8000-0000000000a2';
const B1 = '00000000-0000-4000-8000-0000000000b1';
const B2 = '00000000-0000-4000-8000-0000000000b2';
const B3 = '00000000-0000-4000-8000-0000000000b3';
const USUARIO = '00000000-0000-4000-8000-0000000000c1';

function bloqueio(parcial: Partial<SalaBloqueio>): SalaBloqueio {
  return {
    id: B1,
    salaId: SALA_1,
    salaNome: 'Sala 1',
    tipo: 'MANUTENCAO',
    status: 'ATIVO',
    recorrente: false,
    dataInicio: '2026-12-10',
    dataFim: '2026-12-10',
    horaInicio: '08:00',
    horaFim: '12:00',
    dias: [],
    profissionalId: null,
    profissionalNome: null,
    motivo: 'Troca do ar-condicionado',
    criadoPorId: USUARIO,
    criadoPorNome: 'Ana Teste',
    canceladoEm: null,
    canceladoPorId: null,
    canceladoPorNome: null,
    motivoCancelamento: null,
    oculto: false,
    createdAt: '2026-11-19T10:00:00.000Z',
    updatedAt: '2026-11-19T10:00:00.000Z',
    ...parcial,
  };
}

const LISTA = [
  bloqueio({}),
  bloqueio({
    id: B2,
    salaId: SALA_2,
    salaNome: 'Sala 2',
    tipo: 'RESERVA',
    recorrente: true,
    horaInicio: null,
    horaFim: null,
    dataInicio: '2026-12-01',
    dataFim: '2026-12-31',
    dias: [{ diaSemana: 1, inicio: '14:00', fim: '18:00' }],
    profissionalId: USUARIO,
    profissionalNome: 'Dra. Ana Teste',
    motivo: null,
  }),
  bloqueio({
    id: B3,
    tipo: 'CORTESIA',
    status: 'CANCELADO',
    canceladoEm: '2026-11-20T15:30:00.000Z',
    canceladoPorId: USUARIO,
    canceladoPorNome: 'Ana Teste',
    motivo: 'Pintura da sala',
    motivoCancelamento: 'Obra adiada',
  }),
];

const pagina = (data: SalaBloqueio[]) =>
  json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });

function api(
  rotas: NonNullable<ApiFalsaOptions['rotas']> = {},
  usuario: ApiFalsaOptions['usuario'] = USUARIO_TESTE,
) {
  return apiFalsa({
    usuario,
    rotas: {
      [SALAS]: () =>
        json({
          data: [
            { id: SALA_1, nome: 'Sala 1' },
            { id: SALA_2, nome: 'Sala 2' },
          ].map((s) => ({
            ...s,
            numero: null,
            andar: null,
            tipo: 'CONSULTORIO',
            capacidade: 1,
            metragem: null,
            valorHora: null,
            valorTurno: null,
            valorMensal: null,
            equipamentos: null,
            ativo: true,
            emUso: false,
            ocupada: false,
            locatarios: [],
            createdAt: '2026-10-21T12:00:00.000Z',
            updatedAt: '2026-10-21T12:00:00.000Z',
          })),
          meta: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
        }),
      [BLOQUEIOS]: () => pagina(LISTA),
      ...rotaMotivosCancelamento,
      ...rotas,
    },
  });
}

async function abrirAba(fetchMock = api(), nomeAba = 'Bloqueios') {
  const user = userEvent.setup();
  renderApp('/salas', fetchMock);
  await user.click(await screen.findByRole('tab', { name: nomeAba }));
  return { user, fetchMock };
}

async function escolher(
  user: ReturnType<typeof userEvent.setup>,
  modal: HTMLElement,
  campo: RegExp | string,
  opcao: string,
) {
  await user.click(within(modal).getByRole('combobox', { name: campo }));
  await user.click(await screen.findByRole('option', { name: opcao }));
}

const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;

describe('Gestão de Salas: aba Bloqueios (issue #138)', () => {
  it('lista tipo, período, horário, responsável e o cancelamento com quem, quando e motivo', async () => {
    await abrirAba();

    const linhaManutencao = (await screen.findByText('Troca do ar-condicionado')).closest('tr')!;
    expect(within(linhaManutencao).getByText('Manutenção')).toBeVisible();
    expect(within(linhaManutencao).getByText('10/12/2026')).toBeVisible();
    expect(within(linhaManutencao).getByText('08:00-12:00')).toBeVisible();
    expect(within(linhaManutencao).getByText('Ana Teste')).toBeVisible();

    const linhaReserva = screen.getByText('Dra. Ana Teste').closest('tr')!;
    expect(within(linhaReserva).getByText('01/12/2026 a 31/12/2026')).toBeVisible();
    expect(within(linhaReserva).getByText('Seg 14:00-18:00')).toBeVisible();

    const linhaCancelada = screen.getByText('Obra adiada').closest('tr')!;
    expect(within(linhaCancelada).getByText(/Cancelado em .* por Ana Teste/)).toBeVisible();
    // Cancelado não tem ações.
    expect(within(linhaCancelada).queryByRole('button', { name: /Cancelar bloqueio/ })).toBeNull();
  });

  it('o tipo aparece com a cor própria e o bloqueio de outro profissional como Ocupado', async () => {
    const lista = [
      bloqueio({
        oculto: true,
        tipo: 'RESERVA',
        motivo: null,
        criadoPorNome: null,
        profissionalNome: null,
      }),
    ];
    await abrirAba(api({ [BLOQUEIOS]: () => pagina(lista) }));

    const linha = (await screen.findByText('Ocupado')).closest('tr')!;
    expect(within(linha).getByText('Reserva').className).toContain('bg-violet-100');
    expect(within(linha).queryByRole('button', { name: /Editar bloqueio/ })).toBeNull();
  });

  it('filtros e status chamam a API com os parâmetros', async () => {
    const { user, fetchMock } = await abrirAba();
    await screen.findByText('Troca do ar-condicionado');

    await user.click(screen.getByRole('button', { name: 'Cancelado' }));
    await waitFor(() =>
      expect(
        chamadasPara(fetchMock, BLOQUEIOS).some(([url]) => url.includes('status=CANCELADO')),
      ).toBe(true),
    );
    await user.click(screen.getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Reserva' }));
    await waitFor(() =>
      expect(chamadasPara(fetchMock, BLOQUEIOS).some(([url]) => url.includes('tipo=RESERVA'))).toBe(
        true,
      ),
    );
  });

  it('Novo Bloqueio: campos obrigatórios, envio e período único', async () => {
    const criar = vi.fn(() => json(LISTA[0], 201));
    const { user, fetchMock } = await abrirAba(
      api({
        [BLOQUEIOS]: (init) => (init?.method === 'POST' ? criar() : pagina(LISTA)),
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Novo Bloqueio' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Bloqueio' });

    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    expect(await within(modal).findByText('Sala é obrigatória.')).toBeVisible();
    expect(within(modal).getByText('Tipo é obrigatório.')).toBeVisible();
    expect(criar).not.toHaveBeenCalled();

    await escolher(user, modal, /Sala/, 'Sala 1');
    await escolher(user, modal, /Tipo/, 'Manutenção');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(criar).toHaveBeenCalled());
    const envio = chamadasPara(fetchMock, BLOQUEIOS).find(([, init]) => init?.method === 'POST');
    expect(corpoDe(envio?.[1])).toMatchObject({
      salaId: SALA_1,
      tipo: 'MANUTENCAO',
      recorrente: false,
      horaInicio: '08:00',
      horaFim: '18:00',
    });
  });

  it('recorrente exige ao menos um dia da semana', async () => {
    const { user } = await abrirAba();
    await user.click(await screen.findByRole('button', { name: 'Novo Bloqueio' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Bloqueio' });
    await escolher(user, modal, /Sala/, 'Sala 1');
    await escolher(user, modal, /Tipo/, 'Reserva');
    await user.click(within(modal).getByRole('switch', { name: /Repetir nos dias da semana/ }));
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    expect(await within(modal).findByText('Selecione ao menos um dia da semana')).toBeVisible();
    await user.click(within(modal).getByRole('button', { name: 'Seg' }));
    expect(within(modal).getByLabelText('Segunda: hora inicial')).toHaveValue('08:00');
  });

  it('Cancelar: motivo da lista obrigatório, envia o motivo e não exclui', async () => {
    const cancelar = vi.fn(() => json({ ...LISTA[0], status: 'CANCELADO' }));
    const { user, fetchMock } = await abrirAba(
      api({ [`${BLOQUEIOS}/${B1}/cancelar`]: () => cancelar() }),
    );
    await user.click(await screen.findByRole('button', { name: 'Cancelar bloqueio de Sala 1' }));
    const modal = await screen.findByRole('dialog', { name: 'Cancelar bloqueio' });

    await user.click(within(modal).getByRole('button', { name: 'Cancelar bloqueio' }));
    expect(await within(modal).findByText('Motivo é obrigatório.')).toBeVisible();
    expect(cancelar).not.toHaveBeenCalled();

    await escolher(user, modal, /Motivo/, 'Paciente desistiu');
    await user.type(within(modal).getByLabelText('Observação'), 'Obra adiada');
    await user.click(within(modal).getByRole('button', { name: 'Cancelar bloqueio' }));
    await waitFor(() => expect(cancelar).toHaveBeenCalled());
    const envio = chamadasPara(fetchMock, `${BLOQUEIOS}/${B1}/cancelar`)[0];
    expect(corpoDe(envio?.[1])).toEqual({ motivoId: MOTIVO_ID, observacao: 'Obra adiada' });
    expect(
      chamadasPara(fetchMock, `${BLOQUEIOS}/${B1}`).some(([, i]) => i?.method === 'DELETE'),
    ).toBe(false);
  });

  it('Cancelar: o motivo "Outro" exige a observação', async () => {
    const cancelar = vi.fn(() => json({ ...LISTA[0], status: 'CANCELADO' }));
    const { user } = await abrirAba(api({ [`${BLOQUEIOS}/${B1}/cancelar`]: () => cancelar() }));
    await user.click(await screen.findByRole('button', { name: 'Cancelar bloqueio de Sala 1' }));
    const modal = await screen.findByRole('dialog', { name: 'Cancelar bloqueio' });

    await escolher(user, modal, /Motivo/, 'Outro');
    await user.click(within(modal).getByRole('button', { name: 'Cancelar bloqueio' }));
    expect(await within(modal).findByText('Observação é obrigatória.')).toBeVisible();
    expect(cancelar).not.toHaveBeenCalled();

    await user.type(within(modal).getByLabelText(/Observação/), 'Detalhe fictício');
    await user.click(within(modal).getByRole('button', { name: 'Cancelar bloqueio' }));
    await waitFor(() => expect(cancelar).toHaveBeenCalled());
    expect(MOTIVO_OUTRO_ID).toBeTruthy();
  });

  it('erro de conflito (409) do servidor aparece no formulário', async () => {
    const { user } = await abrirAba(
      api({
        [BLOQUEIOS]: (init) =>
          init?.method === 'POST'
            ? json(
                {
                  statusCode: 409,
                  code: 'SALA_BLOQUEIO_CONFLITO',
                  message: 'A sala Sala 1 já tem manutenção em 10/12/2026 (08:00-12:00).',
                },
                409,
              )
            : pagina(LISTA),
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Novo Bloqueio' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Bloqueio' });
    await escolher(user, modal, /Sala/, 'Sala 1');
    await escolher(user, modal, /Tipo/, 'Manutenção');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    expect(await within(modal).findByText(/já tem manutenção em 10\/12\/2026/)).toBeVisible();
  });

  it('textos em inglês (issue #205)', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    await abrirAba(api({}, usuario), 'Blocks');

    expect(await screen.findByText('Maintenance')).toBeVisible();
    expect(screen.getByText('Booking')).toBeVisible();
    expect(screen.getByRole('button', { name: 'New Block' })).toBeVisible();
    expect(screen.getByText(/Canceled on .* by Ana Teste/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel block of Sala 1' })).toBeVisible();
  });
});

describe('Gestão de Salas: Mapa com bloqueios (issue #138)', () => {
  const OCUPACAO = `${SALAS}/ocupacao`;
  const mapa = () =>
    json({
      inicio: '2026-12-07',
      fim: '2026-12-13',
      salas: [
        {
          salaId: SALA_1,
          salaNome: 'Sala 1',
          blocos: [],
          bloqueios: [
            {
              bloqueioId: B1,
              tipo: 'MANUTENCAO',
              data: '2026-12-10',
              inicio: '08:00',
              fim: '24:00',
              profissionalNome: null,
              oculto: false,
            },
            {
              bloqueioId: B2,
              tipo: 'RESERVA',
              data: '2026-12-11',
              inicio: '00:00',
              fim: '24:00',
              profissionalNome: null,
              oculto: true,
            },
          ],
        },
      ],
    });

  it('mostra cada bloqueio com a cor do tipo, o dia inteiro, Ocupado e a legenda', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-09T12:00:00'));
    try {
      const { user } = await abrirAba(api({ [OCUPACAO]: mapa }), 'Mapa Ocupação');

      const manutencao = (await screen.findAllByText('Manutenção')).find((el) => el.closest('td'))!;
      expect(manutencao.closest('li')!.className).toContain('bg-amber-100');
      expect(within(manutencao.closest('li')!).getByText('08:00-24:00')).toBeVisible();

      const reserva = screen.getAllByText('Reserva').find((el) => el.closest('td'))!;
      const item = reserva.closest('li')!;
      expect(item.className).toContain('bg-violet-100');
      expect(within(item).getByText('Ocupado')).toBeVisible();
      expect(within(item).getByText('Dia inteiro')).toBeVisible();

      const legenda = screen.getByRole('list', { name: 'Legenda' });
      for (const nome of [
        'Contratado',
        'Bloqueio',
        'Manutenção',
        'Reserva',
        'Cortesia',
        'Uso avulso',
      ]) {
        expect(within(legenda).getByText(nome)).toBeVisible();
      }
      expect(user).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
