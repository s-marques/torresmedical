import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  CONSULTA_EXPORT_DEFINITIONS,
  ConsultasRealizadasService,
  rotuloPagamento,
  toConsultaRealizada,
} from './consultas-realizadas.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const INICIO = new Date('2026-10-10T11:00:00.000Z');

const AGENDAMENTO = {
  id: ID,
  numero: 1,
  pacienteId: ID,
  profissionalId: ID,
  salaId: null,
  tipoAgendamentoId: ID,
  inicio: INICIO,
  duracaoMinutos: 30,
  valor: new Prisma.Decimal('295'),
  convenio: false,
  observacoes: null,
  status: 'ATENDIDO' as const,
  formaPagamentoId: null,
  pagoEm: null,
  chegadaEm: null,
  entradaEm: null,
  finalizadoEm: null,
  createdAt: INICIO,
  updatedAt: INICIO,
  deletedAt: null,
  paciente: { nome: 'Paciente Teste', celular: '11900000000', telefone: '1130000000' },
  profissional: { nome: 'Profissional Teste' },
  tipoAgendamento: { nome: 'Procedimento' },
  formaPagamento: null,
};

const PAGO = {
  ...AGENDAMENTO,
  pagoEm: INICIO,
  formaPagamentoId: ID,
  formaPagamento: { nome: 'Voucher' },
};

function setup() {
  const agendamento = {
    findMany: jest.fn().mockResolvedValue([AGENDAMENTO]),
    count: jest.fn().mockResolvedValue(1),
    aggregate: jest
      .fn()
      .mockResolvedValueOnce({ _count: { _all: 4 }, _sum: { valor: new Prisma.Decimal('1180') } })
      .mockResolvedValueOnce({ _sum: { valor: new Prisma.Decimal('250') } }),
  };
  const txHost = { tx: { agendamento } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'consultas-realizadas.xlsx' }),
  };
  const service = new ConsultasRealizadasService(txHost, exportService as unknown as ExportService);
  return { service, agendamento, exportService };
}

const consulta = (extra: object = {}) => ({
  page: 1,
  pageSize: 10,
  sort: { field: 'data' as const, direction: 'desc' as const },
  search: undefined,
  de: undefined,
  ate: undefined,
  pagamento: undefined,
  ...extra,
});

describe('ConsultasRealizadasService', () => {
  it('toConsultaRealizada usa o celular (ou o telefone) e "Sem cobrança" quando não pago', () => {
    expect(toConsultaRealizada(AGENDAMENTO)).toMatchObject({
      data: '2026-10-10T11:00:00.000Z',
      paciente: 'Paciente Teste',
      pacienteTelefone: '11900000000',
      tipo: 'Procedimento',
      valor: '295',
      pago: false,
      formaPagamento: null,
    });
    const semCelular = toConsultaRealizada({
      ...AGENDAMENTO,
      paciente: { nome: 'X', celular: null, telefone: '1130000000' },
      valor: null,
      tipoAgendamento: null,
    });
    expect(semCelular).toMatchObject({ pacienteTelefone: '1130000000', valor: '0', tipo: null });
  });

  it('rotuloPagamento', () => {
    expect(rotuloPagamento(toConsultaRealizada(AGENDAMENTO))).toBe('Sem cobrança');
    expect(rotuloPagamento(toConsultaRealizada(PAGO))).toBe('Pago (Voucher)');
    expect(rotuloPagamento({ pago: true, formaPagamento: null })).toBe('Pago');
  });

  it('list só traz atendidos não excluídos, ordenados pela data', async () => {
    const { service, agendamento } = setup();
    const res = await service.list(consulta());
    expect(res.data).toHaveLength(1);
    expect(agendamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, status: 'ATENDIDO' },
        orderBy: [{ inicio: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 10,
      }),
    );
  });

  it('list aplica o período no dia do calendário da clínica e o filtro de pagamento', async () => {
    const { service, agendamento } = setup();
    await service.list(consulta({ de: '2026-10-01', ate: '2026-10-30', pagamento: 'pago' }));
    expect(agendamento.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      status: 'ATENDIDO',
      inicio: {
        gte: new Date('2026-10-01T03:00:00.000Z'),
        lt: new Date('2026-10-31T03:00:00.000Z'),
      },
      pagoEm: { not: null },
    });
    await service.list(consulta({ pagamento: 'pendente' }));
    expect(agendamento.findMany.mock.calls[1][0].where.pagoEm).toBeNull();
  });

  it.each([
    ['paciente', { paciente: { nome: 'asc' } }],
    ['profissional', { profissional: { nome: 'asc' } }],
    ['tipo', { tipoAgendamento: { nome: 'asc' } }],
    ['valor', { valor: 'asc' }],
    ['pagamento', { formaPagamento: { nome: 'asc' } }],
  ])('list ordena por %s', async (field, esperado) => {
    const { service, agendamento } = setup();
    await service.list(consulta({ sort: { field, direction: 'asc' } }));
    expect(agendamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [esperado, { id: 'asc' }] }),
    );
  });

  it('totais soma tudo e só as consultas pagas para o card Recebido', async () => {
    const { service, agendamento } = setup();
    const r = await service.totais({ de: '2026-10-01', ate: undefined, pagamento: undefined });
    expect(r).toEqual({ totalConsultas: 4, valorTotal: '1180', recebido: '250' });
    expect(agendamento.aggregate.mock.calls[1][0].where).toEqual({
      AND: [
        {
          deletedAt: null,
          status: 'ATENDIDO',
          inicio: { gte: new Date('2026-10-01T03:00:00.000Z') },
        },
        { pagoEm: { not: null } },
      ],
    });
  });

  it('totais sem consultas retorna zeros', async () => {
    const { service, agendamento } = setup();
    agendamento.aggregate.mockReset();
    agendamento.aggregate
      .mockResolvedValueOnce({ _count: { _all: 0 }, _sum: { valor: null } })
      .mockResolvedValueOnce({ _sum: { valor: null } });
    expect(await service.totais({ de: undefined, ate: undefined, pagamento: undefined })).toEqual({
      totalConsultas: 0,
      valorTotal: '0',
      recebido: '0',
    });
  });

  it('export respeita o limite e usa as colunas do grid', async () => {
    const { service, exportService } = setup();
    await service.export({ ...consulta(), format: 'pdf', columns: ['data', 'pagamento'] });
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    expect(exportService.export).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'consultas-realizadas', format: 'pdf' }),
    );
  });

  it('colunas exportadas: tipo vazio vira "-" e pagamento ganha o texto do grid', () => {
    const c = toConsultaRealizada({ ...PAGO, tipoAgendamento: null });
    const valor = (key: string) => CONSULTA_EXPORT_DEFINITIONS.find((d) => d.key === key)?.value(c);
    expect(valor('tipo')).toBe('-');
    expect(valor('pagamento')).toBe('Pago (Voucher)');
    expect(valor('paciente')).toBe('Paciente Teste');
  });
});
