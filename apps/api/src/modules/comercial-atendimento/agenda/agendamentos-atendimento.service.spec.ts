import type { TransactionHost } from '@nestjs-cls/transactional';
import type { AuditService } from '../../../common/audit/audit.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  AgendamentosAtendimentoService,
  toAtendimentoMedicoItem,
} from './agendamentos-atendimento.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID_PROF = '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const INICIO = new Date('2026-11-17T11:30:00.000Z');

const AGENDAMENTO = {
  id: ID,
  numero: 7,
  pacienteId: ID,
  profissionalId: ID_PROF,
  inicio: INICIO,
  status: 'CONFIRMADO' as const,
  pagoEm: null as Date | null,
  paciente: { nome: 'Paciente Fictício' },
  profissional: { nome: 'Profissional Fictício' },
  tipoAgendamento: { nome: 'Procedimento' } as { nome: string } | null,
};

function setup(registro = AGENDAMENTO) {
  const agendamento = {
    findMany: jest.fn().mockResolvedValue([registro]),
    count: jest.fn().mockResolvedValue(1),
    findFirst: jest.fn().mockResolvedValue(registro),
    update: jest
      .fn()
      .mockImplementation(({ data }: { data: { status: string } }) =>
        Promise.resolve({ ...registro, ...data }),
      ),
  };
  const txHost = { tx: { agendamento } } as unknown as TransactionHost<PrismaAdapter>;
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AgendamentosAtendimentoService(txHost, audit as unknown as AuditService);
  return { service, agendamento, audit };
}

const QUERY = {
  page: 1,
  pageSize: 100,
  sort: { field: 'inicio' as const, direction: 'asc' as const },
  search: undefined,
  data: '2026-11-17',
};

describe('AgendamentosAtendimentoService', () => {
  it('toAtendimentoMedicoItem: procedimento é o tipo e pago vem de pagoEm', () => {
    expect(toAtendimentoMedicoItem(AGENDAMENTO as never)).toEqual({
      id: ID,
      inicio: INICIO.toISOString(),
      pacienteId: ID,
      pacienteNome: 'Paciente Fictício',
      profissionalId: ID_PROF,
      profissionalNome: 'Profissional Fictício',
      procedimento: 'Procedimento',
      status: 'CONFIRMADO',
      pago: false,
    });
    expect(
      toAtendimentoMedicoItem({ ...AGENDAMENTO, pagoEm: INICIO, tipoAgendamento: null } as never),
    ).toMatchObject({ procedimento: null, pago: true });
  });

  it('listarDoDia: dia inteiro no fuso da clínica, sem filtros opcionais', async () => {
    const { service, agendamento } = setup();
    const pagina = await service.listarDoDia(QUERY);

    expect(pagina.meta).toEqual({ page: 1, pageSize: 100, total: 1, totalPages: 1 });
    const args = agendamento.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      deletedAt: null,
      inicio: {
        gte: new Date('2026-11-17T03:00:00.000Z'),
        lt: new Date('2026-11-18T03:00:00.000Z'),
      },
    });
    expect(args.orderBy[0]).toEqual({ inicio: 'asc' });
  });

  it('listarDoDia: filtra por profissional e status e ordena por nome', async () => {
    const { service, agendamento } = setup();
    await service.listarDoDia({
      ...QUERY,
      profissionalId: ID_PROF,
      status: 'AGUARDANDO',
      sort: { field: 'paciente', direction: 'desc' },
    });
    const args = agendamento.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ profissionalId: ID_PROF, status: 'AGUARDANDO' });
    expect(args.orderBy[0]).toEqual({ paciente: { nome: 'desc' } });

    await service.listarDoDia({ ...QUERY, sort: { field: 'profissional', direction: 'asc' } });
    expect(agendamento.findMany.mock.calls[1][0].orderBy[0]).toEqual({
      profissional: { nome: 'asc' },
    });
  });

  it('resumo: 404 para id inexistente ou inválido', async () => {
    const { service, agendamento } = setup();
    agendamento.findFirst.mockResolvedValueOnce(null);
    await expect(service.resumo(ID)).rejects.toMatchObject({ status: 404 });
    await expect(service.resumo('abc')).rejects.toMatchObject({ status: 404 });
  });

  it('alterarStatus: grava o novo status e audita before/after', async () => {
    const { service, agendamento, audit } = setup();
    const item = await service.alterarStatus(ID, 'EM_ATENDIMENTO');

    expect(item.status).toBe('EM_ATENDIMENTO');
    expect(agendamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ID }, data: { status: 'EM_ATENDIMENTO' } }),
    );
    expect(audit.record).toHaveBeenCalledWith({
      action: 'UPDATE',
      entity: 'Agendamento',
      entityId: ID,
      before: expect.objectContaining({ status: 'CONFIRMADO' }),
      after: expect.objectContaining({ status: 'EM_ATENDIMENTO' }),
    });
  });

  it('alterarStatus: sem mudança quando o status já é o pedido', async () => {
    const { service, agendamento, audit } = setup({
      ...AGENDAMENTO,
      status: 'EM_ATENDIMENTO' as never,
    });
    await service.alterarStatus(ID, 'EM_ATENDIMENTO');
    expect(agendamento.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
