import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { TransactionHost } from '@nestjs-cls/transactional';
import type { AuditService } from '../../../common/audit/audit.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { FormasPagamentoService } from '../../financeiro/formas-pagamento/formas-pagamento.service';
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
  valor: { toString: () => '250', valueOf: () => 250 } as unknown as number | null,
  formaPagamentoId: null as string | null,
  paciente: { nome: 'Paciente Fictício' },
  profissional: { nome: 'Profissional Fictício' },
  tipoAgendamento: { nome: 'Procedimento' } as { nome: string } | null,
};

const ID_FORMA = '2b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const FORMAS = [{ id: ID_FORMA, label: 'PIX', descricao: 'Receber' }];

function setup(registro = AGENDAMENTO, recebidos: number[] = [], escopo?: string[]) {
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
  const agendamentoRecebimento = {
    findMany: jest.fn().mockResolvedValue(
      recebidos.map((valor, i) => ({
        id: `r${i}`,
        agendamentoId: ID,
        valor,
        formaPagamentoId: ID_FORMA,
        recebidoEm: INICIO,
        formaPagamento: { nome: 'PIX' },
      })),
    ),
    create: jest.fn().mockImplementation(({ data }: { data: { valor: number } }) =>
      Promise.resolve({
        id: 'novo',
        agendamentoId: ID,
        valor: data.valor,
        formaPagamentoId: ID_FORMA,
        recebidoEm: INICIO,
        formaPagamento: { nome: 'PIX' },
      }),
    ),
  };
  const txHost = {
    tx: { agendamento, agendamentoRecebimento },
  } as unknown as TransactionHost<PrismaAdapter>;
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const formas = {
    paraRecebimentoSemCartao: jest.fn().mockResolvedValue(FORMAS),
    ehCartao: jest.fn().mockResolvedValue(false),
  };
  const service = new AgendamentosAtendimentoService(
    txHost,
    audit as unknown as AuditService,
    formas as unknown as FormasPagamentoService,
    escopoFalso(escopo),
  );
  return { service, agendamento, agendamentoRecebimento, audit, formas };
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

  it('alterarStatus: grava o novo status, o horário de entrada e audita before/after', async () => {
    const { service, agendamento, audit } = setup();
    const item = await service.alterarStatus(ID, 'EM_ATENDIMENTO');

    expect(item.status).toBe('EM_ATENDIMENTO');
    expect(agendamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ID },
        data: { status: 'EM_ATENDIMENTO', entradaEm: expect.any(Date) },
      }),
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

  describe('pagamento', () => {
    it('soma o já recebido e calcula o saldo', async () => {
      const { service } = setup(AGENDAMENTO, [100, 50.1]);
      expect(await service.pagamento(ID)).toMatchObject({
        valorConsulta: 250,
        recebido: 150.1,
        saldo: 99.9,
        pago: false,
        formasPagamento: FORMAS,
      });
    });

    it('sem valor da consulta, o saldo fica indefinido', async () => {
      const { service } = setup({ ...AGENDAMENTO, valor: null });
      expect(await service.pagamento(ID)).toMatchObject({ valorConsulta: null, saldo: null });
    });

    it('recebimento parcial grava sem marcar pago', async () => {
      const { service, agendamento, agendamentoRecebimento, audit } = setup();
      const r = await service.registrarRecebimento(ID, { valor: 100, formaPagamentoId: ID_FORMA });
      expect(r).toMatchObject({ valor: 100, formaPagamentoNome: 'PIX' });
      expect(agendamentoRecebimento.create).toHaveBeenCalled();
      expect(agendamento.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('recebimento que quita marca pago com a forma e audita o agendamento', async () => {
      const { service, agendamento, audit } = setup(AGENDAMENTO, [150]);
      await service.registrarRecebimento(ID, { valor: 100, formaPagamentoId: ID_FORMA });
      expect(agendamento.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { pagoEm: INICIO, formaPagamentoId: ID_FORMA } }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'Agendamento', action: 'UPDATE' }),
      );
    });

    it('recusa cancelado, já pago, cartão e valor acima do saldo', async () => {
      const entrada = { valor: 10, formaPagamentoId: ID_FORMA };
      await expect(
        setup({ ...AGENDAMENTO, status: 'CANCELADO' as never }).service.registrarRecebimento(
          ID,
          entrada,
        ),
      ).rejects.toMatchObject({ code: 'AGENDAMENTO_CANCELADO' });
      await expect(
        setup({ ...AGENDAMENTO, pagoEm: INICIO }).service.registrarRecebimento(ID, entrada),
      ).rejects.toMatchObject({ code: 'AGENDAMENTO_JA_PAGO' });
      const cartao = setup();
      cartao.formas.ehCartao.mockResolvedValue(true);
      await expect(cartao.service.registrarRecebimento(ID, entrada)).rejects.toMatchObject({
        code: 'FORMA_PAGAMENTO_CARTAO',
      });
      await expect(
        setup(AGENDAMENTO, [200]).service.registrarRecebimento(ID, { ...entrada, valor: 60 }),
      ).rejects.toMatchObject({ code: 'VALOR_ACIMA_DO_SALDO' });
    });
  });

  describe('escopo de dados (issue #153)', () => {
    const OUTRO = '9b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

    it('listarDoDia: restrito lista só os profissionais vinculados', async () => {
      const { service, agendamento } = setup(AGENDAMENTO, [], [ID_PROF]);
      await service.listarDoDia(QUERY);
      expect(agendamento.findMany.mock.calls[0][0].where.profissionalId).toEqual({
        in: [ID_PROF],
      });
    });

    it('resumo, pagamento e alterarStatus: agendamento de outro profissional dá 403', async () => {
      const { service, agendamento } = setup(AGENDAMENTO, [], [OUTRO]);
      await expect(service.resumo(AGENDAMENTO.id)).rejects.toMatchObject({ status: 403 });
      await expect(service.pagamento(AGENDAMENTO.id)).rejects.toMatchObject({ status: 403 });
      await expect(service.alterarStatus(AGENDAMENTO.id, 'ATENDIDO')).rejects.toMatchObject({
        status: 403,
      });
      expect(agendamento.update).not.toHaveBeenCalled();
    });
  });
});
