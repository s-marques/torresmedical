import { escopoFalso } from '../../../../test/utils/escopo-falso';
import { MetasService } from './metas.service';

const ID = '00000000-0000-4000-8000-0000000000f1';
const ANA = '00000000-0000-4000-8000-0000000000d1';

type Linha = Record<string, unknown>;

function meta(extra: Linha = {}): Linha {
  return {
    id: ID,
    metrica: 'LEADS',
    periodoTipo: 'MES',
    periodo: '2026-11',
    dataInicio: new Date('2026-11-01T00:00:00Z'),
    dataFim: new Date('2026-11-30T00:00:00Z'),
    responsavelId: null,
    valor: '40',
    observacoes: null,
    createdAt: new Date('2026-11-01T12:00:00Z'),
    updatedAt: new Date('2026-11-01T12:00:00Z'),
    deletedAt: null,
    ...extra,
  };
}

/** Service com o Prisma simulado. `contagem` é o realizado devolvido pelas consultas do CRM. */
function criar({
  metas = [meta()],
  contagem = 10,
  soma = null,
  existente = null,
  restrito = false,
}: {
  metas?: Linha[];
  contagem?: number;
  soma?: string | null;
  existente?: Linha | null;
  restrito?: boolean;
} = {}) {
  const negocio = {
    count: jest.fn(async () => contagem),
    aggregate: jest.fn(async () => ({ _sum: { valor: soma } })),
  };
  const metaComercial = {
    findFirst: jest.fn(async ({ where }: { where: Linha }) =>
      'metrica' in where ? existente : (metas[0] ?? null),
    ),
    findMany: jest.fn(async () => metas),
    count: jest.fn(async () => metas.length),
    create: jest.fn(async ({ data }: { data: Linha }) => ({ ...meta(), ...data })),
    update: jest.fn(async ({ data }: { data: Linha }) => ({ ...meta(), ...data })),
  };
  const usuarios = {
    responsaveis: jest.fn(async () => [{ id: ANA, nome: 'Ana Teste' }]),
    nomesPorIds: jest.fn(async () => new Map([[ANA, 'Ana Teste']])),
    garantirAtivo: jest.fn(async () => undefined),
  };
  const service = new MetasService(
    { tx: { negocio, metaComercial } } as never,
    restrito ? escopoFalso(['p1']) : escopoFalso(),
    usuarios as never,
  );
  return { service, negocio, metaComercial, usuarios };
}

const ENTRADA = {
  metrica: 'LEADS' as const,
  periodoTipo: 'TRIMESTRE' as const,
  periodo: '2026-T4',
  responsavelId: null,
  valor: 120,
  observacoes: null,
};

describe('MetasService', () => {
  it('calcula o percentual atingido e devolve o responsável pelo nome', async () => {
    const { service } = criar({ metas: [meta({ responsavelId: ANA })], contagem: 25 });

    const dto = await service.findById(ID);

    expect(dto).toMatchObject({
      valor: 40,
      realizado: 25,
      percentual: 62.5,
      responsavel: 'Ana Teste',
      dataInicio: '2026-11-01',
      dataFim: '2026-11-30',
    });
  });

  it('meta zerada fica sem percentual', async () => {
    const { service } = criar({ metas: [meta({ valor: '0' })] });
    expect((await service.findById(ID)).percentual).toBeNull();
  });

  it('receita nova soma o valor dos negócios ganhos; sem negócios, zero', async () => {
    const com = criar({
      metas: [meta({ metrica: 'RECEITA_NOVA', valor: '2000' })],
      soma: '500.50',
    });
    expect((await com.service.findById(ID)).realizado).toBe(500.5);
    const sem = criar({ metas: [meta({ metrica: 'RECEITA_NOVA' })], soma: null });
    expect((await sem.service.findById(ID)).realizado).toBe(0);
  });

  it('filtra os negócios pelo responsável da meta, e a meta da equipe conta todos', async () => {
    const daAna = criar({ metas: [meta({ responsavelId: ANA })] });
    await daAna.service.findById(ID);
    expect(daAna.negocio.count.mock.calls[0]?.[0]).toMatchObject({
      where: { deletedAt: null, responsavelId: ANA },
    });

    const equipe = criar();
    await equipe.service.findById(ID);
    expect(equipe.negocio.count.mock.calls[0]?.[0].where).not.toHaveProperty('responsavelId');
  });

  it('cria com as datas do trimestre e valida o responsável', async () => {
    const { service, metaComercial, usuarios } = criar();

    await service.create({ ...ENTRADA, responsavelId: ANA });

    expect(usuarios.garantirAtivo).toHaveBeenCalledWith(ANA, 'Responsável');
    expect(metaComercial.create.mock.calls[0]?.[0].data).toMatchObject({
      periodo: '2026-T4',
      dataInicio: new Date('2026-10-01T00:00:00Z'),
      dataFim: new Date('2026-12-31T00:00:00Z'),
      responsavelId: ANA,
    });
  });

  it('recusa meta duplicada (409) e período incompatível com o tipo (400)', async () => {
    const duplicada = criar({ existente: { id: 'outra' } });
    await expect(duplicada.service.create(ENTRADA)).rejects.toMatchObject({
      code: 'META_COMERCIAL_DUPLICADA',
      getStatus: expect.any(Function),
    });
    expect(duplicada.metaComercial.create).not.toHaveBeenCalled();

    const { service } = criar();
    await expect(service.create({ ...ENTRADA, periodo: '2026-11' })).rejects.toMatchObject({
      code: 'META_COMERCIAL_PERIODO_INVALIDO',
    });
  });

  it('alterar ignora a própria meta na checagem de duplicidade', async () => {
    const { service, metaComercial } = criar();
    await service.update(ID, ENTRADA);
    const where = metaComercial.findFirst.mock.calls.at(-1)?.[0].where;
    expect(where).toMatchObject({ id: { not: ID }, metrica: 'LEADS', periodo: '2026-T4' });
  });

  it('exclui logicamente e 404 para meta inexistente', async () => {
    const { service, metaComercial } = criar();
    await service.remove(ID);
    expect(metaComercial.update.mock.calls[0]?.[0].data.deletedAt).toBeInstanceOf(Date);

    const vazio = criar({ metas: [] });
    await expect(vazio.service.remove(ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('acompanhamento soma metas do mesmo período e métrica num ponto só', async () => {
    const { service } = criar({
      metas: [
        meta({ id: 'a', responsavelId: ANA, valor: '2' }),
        meta({ id: 'b', valor: '2' }),
        meta({ id: 'c', metrica: 'VISITAS', valor: '5' }),
      ],
      contagem: 1,
    });

    const { resumo, evolucao } = await service.acompanhamento({});

    expect(evolucao).toHaveLength(2);
    expect(evolucao[0]).toMatchObject({
      metrica: 'LEADS',
      projetado: 4,
      realizado: 2,
      percentual: 50,
    });
    expect(resumo.map((r) => r.metrica)).toEqual(['LEADS', 'VISITAS']);
    expect(resumo[1]).toMatchObject({ projetado: 5, realizado: 1, percentual: 20 });
  });

  it('perfil restrito a profissionais vinculados recebe 403 em todos os métodos', async () => {
    const { service } = criar({ restrito: true });
    const chamadas = [
      () => service.list({ page: 1, pageSize: 10, sort: { field: 'valor', direction: 'asc' } }),
      () => service.findById(ID),
      () => service.create(ENTRADA),
      () => service.update(ID, ENTRADA),
      () => service.remove(ID),
      () => service.acompanhamento({}),
      () => service.responsaveis(),
    ];
    for (const chamar of chamadas) {
      await expect(chamar()).rejects.toMatchObject({ code: expect.any(String) });
    }
  });
});
