import { agendadorLigado, CampanhasAgendador } from './campanhas.agendador';
import { CampanhasService } from './campanhas.service';
import { PrepararEnviosConsumer } from './preparar-envios.consumer';
import { agoraNaClinica, formatarDiaClinica } from './relogio-clinica';

const ID = '00000000-0000-4000-8000-0000000000a1';
const CANAL = '00000000-0000-4000-8000-0000000000c1';

function campanha(status: string) {
  return {
    id: ID,
    nome: 'Promoção',
    tipoEnvio: 'TEXTO',
    canalId: CANAL,
    canal: { nome: 'Recepção' },
    filtro: 'TODOS',
    origemClienteId: null,
    origemCliente: null,
    diasCompra: null,
    quantidade: null,
    intervaloSegundos: 5,
    agendadaPara: new Date('2026-12-01T12:00:00.000Z'),
    mensagem: 'Oi',
    status,
    iniciadaEm: null,
    concluidaEm: null,
    canceladaEm: null,
    createdAt: new Date('2026-11-01T12:00:00.000Z'),
  };
}

function montar(status = 'AGENDADA') {
  const atual = campanha(status);
  const tx = {
    campanha: {
      findFirst: jest.fn(async () => atual),
      create: jest.fn(async ({ data }) => ({ ...atual, ...data })),
      update: jest.fn(async ({ data }) => ({ ...atual, ...data })),
    },
    envioCampanha: {
      updateMany: jest.fn(async () => ({ count: 0 })),
      groupBy: jest.fn(async () => [
        { campanhaId: ID, status: 'ENFILEIRADO', _count: { _all: 3 } },
        { campanhaId: ID, status: 'FALHA', _count: { _all: 1 } },
        { campanhaId: ID, status: 'PROGRAMADO', _count: { _all: 2 } },
      ]),
    },
  };
  const canais = { findById: jest.fn(async () => ({ id: CANAL })) };
  const origens = { findById: jest.fn(async () => ({})) };
  const service = new CampanhasService({ tx } as never, canais as never, origens as never);
  return { service, tx, canais, origens };
}

const ENTRADA = {
  nome: 'Promoção',
  tipoEnvio: 'TEXTO' as const,
  canalId: CANAL,
  filtro: 'TODOS' as const,
  origemClienteId: 'x',
  diasCompra: 30,
  quantidade: null,
  intervaloSegundos: 5,
  data: '2026-12-01',
  hora: '09:00',
  mensagem: 'Oi',
};

describe('CampanhasService', () => {
  it('agenda no horário da clínica e só guarda os campos do filtro escolhido', async () => {
    const { service, tx, canais, origens } = montar();
    const dto = await service.create(ENTRADA);
    expect(tx.campanha.create.mock.calls[0]?.[0].data).toMatchObject({
      agendadaPara: new Date('2026-12-01T12:00:00.000Z'),
      origemClienteId: null,
      diasCompra: null,
    });
    expect(canais.findById).toHaveBeenCalledWith(CANAL);
    expect(origens.findById).not.toHaveBeenCalled();
    expect(dto).toMatchObject({ totalDestinatarios: 6, totalEnviados: 3, totalFalhas: 1 });
  });

  it('sem data e hora, sai agora; filtro por origem valida a origem', async () => {
    const { service, tx, origens } = montar();
    const antes = Date.now();
    await service.create({ ...ENTRADA, data: null, hora: null, filtro: 'ORIGEM' });
    const data = tx.campanha.create.mock.calls[0]?.[0].data;
    expect(data.agendadaPara.getTime()).toBeGreaterThanOrEqual(antes);
    expect(data.origemClienteId).toBe('x');
    expect(origens.findById).toHaveBeenCalledWith('x');
  });

  it('só edita agendada; cancela agendada ou em envio; não exclui em envio', async () => {
    await expect(montar('ENVIANDO').service.update(ID, ENTRADA)).rejects.toMatchObject({
      response: { code: 'CAMPANHA_NAO_EDITAVEL' },
    });
    await expect(montar('CONCLUIDA').service.cancelar(ID)).rejects.toMatchObject({
      response: { code: 'CAMPANHA_NAO_CANCELAVEL' },
    });
    await expect(montar('ENVIANDO').service.remove(ID)).rejects.toMatchObject({
      response: { code: 'CAMPANHA_EM_ENVIO' },
    });

    const { service, tx } = montar('ENVIANDO');
    await service.cancelar(ID);
    expect(tx.envioCampanha.updateMany).toHaveBeenCalledWith({
      where: { campanhaId: ID, status: 'PROGRAMADO' },
      data: { status: 'CANCELADO' },
    });
    expect(tx.campanha.update.mock.calls[0]?.[0].data).toMatchObject({ status: 'CANCELADA' });
  });
});

describe('relógio da clínica', () => {
  it('lê dia, hora e dia da semana em São Paulo', () => {
    expect(agoraNaClinica(new Date('2026-11-18T02:30:00.000Z'))).toMatchObject({
      dia: '2026-11-17',
      hora: '23:30',
      diaSemana: 2,
      mes: 11,
      diaDoMes: 17,
    });
    expect(formatarDiaClinica(new Date('2026-11-18T02:30:00.000Z'))).toBe('17/11/2026');
  });
});

describe('consumidor e agendador', () => {
  it('o consumidor encaminha campanha e automação', async () => {
    const envios = {
      prepararCampanha: jest.fn(async () => undefined),
      prepararAutomacao: jest.fn(async () => undefined),
    };
    const consumidor = new PrepararEnviosConsumer(envios as never);
    const envelope = { eventId: 'e', type: 't', occurredAt: '', userId: 'system', version: 1 };
    await consumidor.handle({ ...envelope, payload: { campanhaId: ID } });
    await consumidor.handle({
      ...envelope,
      payload: { mensagemAutomaticaId: ID, dia: '2026-11-17' },
    });
    expect(envios.prepararCampanha).toHaveBeenCalledWith(ID, expect.anything());
    expect(envios.prepararAutomacao).toHaveBeenCalledWith(ID, '2026-11-17', expect.anything());
  });

  it('agendador desliga com CAMPANHAS_AGENDADOR=off', () => {
    expect(agendadorLigado({})).toBe(true);
    expect(agendadorLigado({ CAMPANHAS_AGENDADOR: 'off' })).toBe(false);
  });

  it('erro num passo não impede os outros', async () => {
    const envios = {
      dispararCampanhas: jest.fn(async () => {
        throw new Error('falhou');
      }),
      dispararAutomacoes: jest.fn(async () => 0),
      enfileirar: jest.fn(async () => 2),
    };
    const cls = { run: (fn: () => unknown) => fn() };
    const txHost = { withTransaction: (fn: () => unknown) => fn() };
    const agendador = new CampanhasAgendador(cls as never, txHost as never, envios as never);
    await agendador.rodar(agoraNaClinica());
    expect(envios.dispararAutomacoes).toHaveBeenCalled();
    expect(envios.enfileirar).toHaveBeenCalled();
  });

  it('aCadaMinuto respeita o desligamento', async () => {
    const envios = {
      dispararCampanhas: jest.fn(),
      dispararAutomacoes: jest.fn(),
      enfileirar: jest.fn(),
    };
    const agendador = new CampanhasAgendador({} as never, {} as never, envios as never);
    const anterior = process.env.CAMPANHAS_AGENDADOR;
    process.env.CAMPANHAS_AGENDADOR = 'off';
    await agendador.aCadaMinuto();
    process.env.CAMPANHAS_AGENDADOR = anterior;
    expect(envios.dispararCampanhas).not.toHaveBeenCalled();
  });
});
