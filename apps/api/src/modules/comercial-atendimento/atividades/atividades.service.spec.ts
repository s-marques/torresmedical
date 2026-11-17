import { AtividadesService } from './atividades.service';

const ID = '00000000-0000-4000-8000-0000000000f1';
const NEGOCIO = '00000000-0000-4000-8000-0000000000c1';
const OUTRO_NEGOCIO = '00000000-0000-4000-8000-0000000000c2';
const USUARIO = '00000000-0000-4000-8000-0000000000d1';

type Linha = Record<string, unknown>;

function atividade(extra: Linha = {}): Linha {
  return {
    id: ID,
    negocioId: NEGOCIO,
    tipo: 'TAREFA',
    titulo: 'Ligar',
    descricao: null,
    dataHora: new Date('2026-11-20T12:00:00Z'),
    responsavelId: null,
    status: 'PENDENTE',
    concluidaEm: null,
    canceladaEm: null,
    createdAt: new Date('2026-11-01T12:00:00Z'),
    updatedAt: new Date('2026-11-01T12:00:00Z'),
    deletedAt: null,
    negocio: { titulo: 'Sala 10', status: 'ABERTO' },
    ...extra,
  };
}

/** Service com o Prisma simulado: `pendentes` é a contagem de pendentes do negócio. */
function criar(atual: Linha | null, pendentes = 1) {
  const update = jest.fn(async ({ data }: { data: Linha }) => ({ ...atual, ...data }));
  const create = jest.fn(async ({ data }: { data: Linha }) => ({ ...atividade(), ...data }));
  const groupBy = jest.fn(async ({ where }: { where: { negocioId?: { in: string[] } } }) =>
    (where.negocioId?.in ?? []).map((negocioId) => ({ negocioId, _count: { _all: pendentes } })),
  );
  const tx = {
    atividadeNegocio: { findFirst: jest.fn(async () => atual), update, create, groupBy },
  };
  const negocios = {
    buscarAberto: jest.fn(async (id: string) => ({ id, responsavelId: USUARIO, titulo: 'N' })),
  };
  const usuarios = {
    nomesPorIds: jest.fn(async () => new Map([[USUARIO, 'Usuária Teste']])),
    garantirAtivo: jest.fn(async () => undefined),
  };
  const service = new AtividadesService(
    { tx } as never,
    negocios as never,
    usuarios as never,
    {} as never,
  );
  return { service, update, create, groupBy, negocios };
}

const ENTRADA = {
  titulo: 'Ligar',
  tipo: 'LIGACAO' as const,
  data: '2026-11-20',
  hora: '09:00',
  negocioId: null,
  responsavelId: null,
  descricao: null,
};

describe('AtividadesService', () => {
  describe('próxima ação obrigatória (requisito do cliente, seção 23)', () => {
    it('não conclui nem cancela a última pendente de um negócio aberto', async () => {
      for (const acao of ['concluir', 'cancelar'] as const) {
        const { service, update } = criar(atividade(), 1);
        await expect(service[acao](ID)).rejects.toMatchObject({
          response: { code: 'PROXIMA_ACAO_OBRIGATORIA' },
        });
        expect(update).not.toHaveBeenCalled();
      }
    });

    it('conclui quando há outra pendente, sem negócio ou com negócio fechado', async () => {
      const cenarios = [
        criar(atividade(), 2),
        criar(atividade({ negocioId: null, negocio: null }), 0),
        criar(atividade({ negocio: { titulo: 'N', status: 'GANHO' } }), 1),
      ];
      for (const { service, update } of cenarios) {
        const dto = await service.concluir(ID);
        expect(update.mock.calls[0]?.[0].data).toMatchObject({
          status: 'CONCLUIDA',
          concluidaEm: expect.any(Date),
        });
        expect(dto.status).toBe('CONCLUIDA');
      }
    });

    it('cancelar grava a data do cancelamento', async () => {
      const { service, update } = criar(atividade(), 2);
      await service.cancelar(ID);
      expect(update.mock.calls[0]?.[0].data).toMatchObject({
        status: 'CANCELADA',
        canceladaEm: expect.any(Date),
      });
    });

    it('não tira a última pendente do negócio ao editar', async () => {
      const { service, update } = criar(atividade(), 1);
      await expect(
        service.update(ID, { ...ENTRADA, negocioId: OUTRO_NEGOCIO }),
      ).rejects.toMatchObject({ response: { code: 'PROXIMA_ACAO_OBRIGATORIA' } });
      expect(update).not.toHaveBeenCalled();
    });

    it('marca exigeProximaAcao só na última pendente de negócio aberto', async () => {
      expect((await criar(atividade(), 1).service.findById(ID)).exigeProximaAcao).toBe(true);
      expect((await criar(atividade(), 2).service.findById(ID)).exigeProximaAcao).toBe(false);
      const concluida = criar(atividade({ status: 'CONCLUIDA' }), 1);
      expect((await concluida.service.findById(ID)).exigeProximaAcao).toBe(false);
      expect(concluida.groupBy).not.toHaveBeenCalled();
    });
  });

  it('não reabre atividade concluída ou cancelada', async () => {
    await expect(
      criar(atividade({ status: 'CONCLUIDA' })).service.concluir(ID),
    ).rejects.toMatchObject({ response: { code: 'ATIVIDADE_JA_CONCLUIDA' } });
    await expect(
      criar(atividade({ status: 'CANCELADA' })).service.cancelar(ID),
    ).rejects.toMatchObject({ response: { code: 'ATIVIDADE_JA_CANCELADA' } });
  });

  it('404 para id inválido ou inexistente', async () => {
    await expect(criar(null).service.findById('x')).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
    await expect(criar(null).service.remove(ID)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });

  it('com negócio, a atividade herda o responsável dele; sem negócio, fica sem', async () => {
    const comNegocio = criar(null);
    await comNegocio.service.create({ ...ENTRADA, negocioId: NEGOCIO });
    expect(comNegocio.negocios.buscarAberto).toHaveBeenCalledWith(NEGOCIO);
    expect(comNegocio.create.mock.calls[0]?.[0].data).toMatchObject({
      negocioId: NEGOCIO,
      responsavelId: USUARIO,
      dataHora: new Date('2026-11-20T12:00:00Z'),
    });

    const avulsa = criar(null);
    await avulsa.service.create(ENTRADA);
    expect(avulsa.negocios.buscarAberto).not.toHaveBeenCalled();
    expect(avulsa.create.mock.calls[0]?.[0].data).toMatchObject({
      negocioId: null,
      responsavelId: null,
    });
  });

  it('follow-up do Pipeline herda o responsável do negócio', async () => {
    const { service, create } = criar(null, 1);
    const dto = await service.agendarDoNegocio(NEGOCIO, {
      tipo: 'FOLLOW_UP',
      titulo: 'Ligar',
      data: '2026-11-20',
      hora: '09:00',
      responsavelId: null,
    });
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      negocioId: NEGOCIO,
      responsavelId: USUARIO,
    });
    expect(dto).toMatchObject({ responsavel: 'Usuária Teste', exigeProximaAcao: true });
  });

  it('editar mantendo o negócio não revalida o negócio', async () => {
    const { service, update, negocios } = criar(atividade(), 1);
    await service.update(ID, { ...ENTRADA, negocioId: NEGOCIO, descricao: 'Obs' });
    expect(negocios.buscarAberto).not.toHaveBeenCalled();
    expect(update.mock.calls[0]?.[0].data).toMatchObject({ descricao: 'Obs', tipo: 'LIGACAO' });
  });
});
