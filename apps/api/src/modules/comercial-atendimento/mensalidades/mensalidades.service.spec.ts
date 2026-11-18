import type { TransactionHost } from '@nestjs-cls/transactional';
import type { MensalidadeInput } from '@torres/shared';
import { BusinessException } from '../../../common/errors/api.exception';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { semPermissao } from '../../../common/auth/escopo-dados.service';
import type { PacientesVinculadosService } from '../../consultorio-assistencial/pacientes-vinculados/pacientes-vinculados.service';
import type { FormasPagamentoService } from '../../financeiro/formas-pagamento/formas-pagamento.service';
import type { PacientesService } from '../pacientes/pacientes.service';
import { MensalidadesService, toMensalidade } from './mensalidades.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PACIENTE = '1a2b3c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const FORMA = '2b3c4d5e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const AGORA = new Date('2026-11-01T12:00:00Z');

const REGISTRO = {
  id: ID,
  pacienteId: PACIENTE,
  descricao: 'Plano mensal',
  valor: { toString: () => '150' },
  diaVencimento: 10,
  formaPagamentoId: null as string | null,
  dataInicio: new Date('2026-11-01T00:00:00Z'),
  dataFim: null as Date | null,
  observacoes: null,
  status: 'ATIVO' as 'ATIVO' | 'PAUSADO' | 'CANCELADO',
  createdAt: AGORA,
  updatedAt: AGORA,
  deletedAt: null,
  paciente: { nome: 'Cliente Teste' },
};

const INPUT: MensalidadeInput = {
  pacienteId: PACIENTE,
  descricao: 'Plano mensal',
  valor: 150,
  diaVencimento: 10,
  formaPagamentoId: null,
  dataInicio: '2026-11-01',
  dataFim: null,
  observacoes: null,
};

const naoEncontrado = () => new BusinessException('NOT_FOUND', 'x', { status: 404 });

function setup(
  opcoes: {
    registro?: unknown;
    forma?: unknown;
    pacienteExiste?: boolean;
    restrito?: boolean;
  } = {},
) {
  const registro = 'registro' in opcoes ? opcoes.registro : REGISTRO;
  const mensalidade = {
    findMany: jest.fn().mockResolvedValue([REGISTRO]),
    count: jest.fn().mockResolvedValue(1),
    findFirst: jest.fn().mockResolvedValue(registro),
    create: jest.fn().mockResolvedValue(REGISTRO),
    update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...REGISTRO, ...data })),
  };
  const txHost = { tx: { mensalidade } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'mensalidades.xlsx' }),
  };
  const pacientes = {
    findLookupById: jest
      .fn()
      .mockImplementation(() =>
        opcoes.pacienteExiste === false
          ? Promise.reject(naoEncontrado())
          : Promise.resolve({ id: PACIENTE }),
      ),
  };
  const formas = {
    findById: jest
      .fn()
      .mockImplementation(() =>
        opcoes.forma === undefined
          ? Promise.reject(naoEncontrado())
          : Promise.resolve(opcoes.forma),
      ),
  };
  // Escopo restrito: só PACIENTE é vinculado. Sem restrição: `null` (todos).
  const vinculados = {
    idsNoEscopo: jest.fn().mockResolvedValue(opcoes.restrito ? [PACIENTE] : null),
    garantir: jest
      .fn()
      .mockImplementation((id: string) =>
        opcoes.restrito && id !== PACIENTE ? Promise.reject(semPermissao()) : Promise.resolve(),
      ),
  };
  const service = new MensalidadesService(
    txHost,
    exportService as unknown as ExportService,
    pacientes as unknown as PacientesService,
    formas as unknown as FormasPagamentoService,
    vinculados as unknown as PacientesVinculadosService,
  );
  return { service, mensalidade, exportService, vinculados };
}

async function erroDe(promessa: Promise<unknown>): Promise<BusinessException> {
  try {
    await promessa;
  } catch (erro) {
    return erro as BusinessException;
  }
  throw new Error('esperava erro');
}

describe('toMensalidade', () => {
  it('converte datas, valor e cliente', () => {
    expect(
      toMensalidade({
        ...REGISTRO,
        dataFim: new Date('2027-10-31T00:00:00Z'),
      } as unknown as Parameters<typeof toMensalidade>[0]),
    ).toMatchObject({
      cliente: 'Cliente Teste',
      valor: '150',
      dataInicio: '2026-11-01',
      dataFim: '2027-10-31',
    });
  });
});

describe('MensalidadesService', () => {
  it('list: busca por descrição ou cliente, filtra status e ordena por cliente', async () => {
    const { service, mensalidade } = setup();
    const page = await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'cliente', direction: 'asc' },
      search: 'ana',
      status: 'PAUSADO',
    });
    expect(page.data[0]?.cliente).toBe('Cliente Teste');
    expect(mensalidade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          status: 'PAUSADO',
          OR: expect.any(Array),
        }),
        orderBy: [{ paciente: { nome: 'asc' } }, { id: 'asc' }],
      }),
    );
  });

  it('list: ordena pela coluna e, em "criacao", pela data de criação', async () => {
    const { service, mensalidade } = setup();
    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'valor', direction: 'desc' },
      search: undefined,
    });
    expect(mensalidade.findMany.mock.calls[0][0].orderBy[0]).toEqual({ valor: 'desc' });
    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'criacao', direction: 'desc' },
      search: undefined,
    });
    expect(mensalidade.findMany.mock.calls[1][0].orderBy[0]).toEqual({ createdAt: 'desc' });
  });

  it('findById: 404 quando não existe', async () => {
    const { service } = setup({ registro: null });
    expect((await erroDe(service.findById(ID))).getStatus()).toBe(404);
  });

  it('create: grava as datas como Date e sem forma de pagamento', async () => {
    const { service, mensalidade } = setup();
    await service.create({ ...INPUT, dataFim: '2027-10-31' });
    expect(mensalidade.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dataInicio: new Date('2026-11-01T00:00:00Z'),
          dataFim: new Date('2027-10-31T00:00:00Z'),
          formaPagamentoId: null,
        }),
      }),
    );
  });

  it('create: cliente inexistente vira 400 no campo', async () => {
    const { service } = setup({ pacienteExiste: false });
    const erro = await erroDe(service.create(INPUT));
    expect(erro.getStatus()).toBe(400);
    expect(erro.getResponse()).toMatchObject({
      details: [{ field: 'pacienteId', message: 'Cliente inválido' }],
    });
  });

  it.each([
    ['inexistente', undefined],
    ['de pagamento', { finalidade: 'PAGAR', ativo: true }],
    ['inativa', { finalidade: 'RECEBER', ativo: false }],
  ])('create: forma de pagamento %s vira 400', async (_caso, forma) => {
    const { service, mensalidade } = setup({ forma });
    const erro = await erroDe(service.create({ ...INPUT, formaPagamentoId: FORMA }));
    expect(erro.getStatus()).toBe(400);
    expect(mensalidade.create).not.toHaveBeenCalled();
  });

  it('create: aceita forma de recebimento ativa', async () => {
    const { service, mensalidade } = setup({ forma: { finalidade: 'RECEBER', ativo: true } });
    await service.create({ ...INPUT, formaPagamentoId: FORMA });
    expect(mensalidade.create).toHaveBeenCalled();
  });

  it('update: mantém a forma atual mesmo inativa; bloqueia cancelada', async () => {
    const comForma = { ...REGISTRO, formaPagamentoId: FORMA };
    const { service, mensalidade } = setup({
      registro: comForma,
      forma: { finalidade: 'RECEBER', ativo: false },
    });
    await service.update(ID, { ...INPUT, formaPagamentoId: FORMA });
    expect(mensalidade.update).toHaveBeenCalled();

    const cancelada = setup({ registro: { ...REGISTRO, status: 'CANCELADO' } });
    const erro = await erroDe(cancelada.service.update(ID, INPUT));
    expect(erro.getStatus()).toBe(422);
    expect(cancelada.mensalidade.update).not.toHaveBeenCalled();
  });

  it('mudarStatus: aplica transição permitida e recusa a não permitida', async () => {
    const { service, mensalidade } = setup();
    const pausada = await service.mudarStatus(ID, 'PAUSADO');
    expect(pausada.status).toBe('PAUSADO');
    expect(mensalidade.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PAUSADO' } }),
    );

    const erro = await erroDe(service.mudarStatus(ID, 'ATIVO'));
    expect(erro.getStatus()).toBe(422);
    expect(erro.getResponse()).toMatchObject({ code: 'MENSALIDADE_STATUS_INVALIDO' });
  });

  it('export: respeita o limite e exporta com o título da tela', async () => {
    const { service, exportService } = setup();
    await service.export({
      page: 1,
      pageSize: 10,
      sort: { field: 'cliente', direction: 'asc' },
      format: 'xlsx',
      columns: ['cliente', 'status'],
    } as unknown as Parameters<typeof service.export>[0]);
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    expect(exportService.export).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mensalidades', filename: 'mensalidades' }),
    );
  });

  it('escopo restrito: lista só os pacientes vinculados e barra os de fora', async () => {
    const { service, mensalidade } = setup({ restrito: true });
    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'cliente', direction: 'asc' },
      search: undefined,
    });
    expect(mensalidade.findMany.mock.calls[0][0].where).toMatchObject({
      pacienteId: { in: [PACIENTE] },
    });

    const fora = '3c4d5e6f-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
    const erro = await erroDe(service.create({ ...INPUT, pacienteId: fora }));
    expect(erro.getStatus()).toBe(403);
    expect(mensalidade.create).not.toHaveBeenCalled();

    const deFora = setup({ restrito: true, registro: { ...REGISTRO, pacienteId: fora } });
    expect((await erroDe(deFora.service.findById(ID))).getStatus()).toBe(403);
    expect((await erroDe(deFora.service.mudarStatus(ID, 'PAUSADO'))).getStatus()).toBe(403);
  });

  it('ativas: só status ATIVO e não excluídas', async () => {
    const { service, mensalidade } = setup();
    await service.ativas();
    expect(mensalidade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, status: 'ATIVO' } }),
    );
  });
});
