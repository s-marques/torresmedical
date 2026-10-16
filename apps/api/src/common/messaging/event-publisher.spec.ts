import type { TransactionHost } from '@nestjs-cls/transactional';
import type { RequestContextService } from '../context/request-context.service';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import { EventPublisher } from './event-publisher';
import type { OutboxRelay } from './outbox-relay';

function setup(
  { userId, requestId, emTransacao = false } = {} as {
    userId?: string;
    requestId?: string;
    emTransacao?: boolean;
  },
) {
  const outboxEvent = { create: jest.fn().mockResolvedValue({}) };
  const txHost = {
    tx: { outboxEvent },
    isTransactionActive: () => emTransacao,
  } as unknown as TransactionHost<PrismaAdapter>;
  const context = {
    getUserId: () => userId,
    getRequestId: () => requestId,
  } as RequestContextService;
  const relay = { trigger: jest.fn() };
  const publisher = new EventPublisher(txHost, context, relay as unknown as OutboxRelay);
  return { publisher, outboxEvent, relay };
}

describe('EventPublisher', () => {
  it('grava o envelope na outbox com o usuário do contexto', async () => {
    const { publisher, outboxEvent } = setup({ userId: 'u-1', requestId: 'req-1' });

    const envelope = await publisher.publish('comercial.venda.paga', { vendaId: 'v-1' });

    expect(envelope).toMatchObject({
      type: 'comercial.venda.paga',
      userId: 'u-1',
      payload: { vendaId: 'v-1' },
      version: 1,
    });
    expect(outboxEvent.create).toHaveBeenCalledWith({
      data: { id: envelope.eventId, type: 'comercial.venda.paga', envelope },
    });
  });

  it('usa system fora de HTTP e anonymous em HTTP sem login', async () => {
    expect((await setup().publisher.publish('a.b.c', {})).userId).toBe('system');
    expect((await setup({ requestId: 'r' }).publisher.publish('a.b.c', {})).userId).toBe(
      'anonymous',
    );
  });

  it('aceita usuário e versão explícitos e serializa o payload como JSON', async () => {
    const { publisher } = setup({ userId: 'u-1' });
    const data = new Date('2026-10-16T12:00:00.000Z');

    const envelope = await publisher.publish(
      'financeiro.titulo.gerado',
      { tituloId: 't-1', vencimento: data, extra: undefined },
      { userId: 'u-2', version: 2 },
    );

    expect(envelope).toMatchObject({ userId: 'u-2', version: 2 });
    expect(envelope.payload).toEqual({ tituloId: 't-1', vencimento: '2026-10-16T12:00:00.000Z' });
  });

  it('dispara o relay quando grava fora de transação', async () => {
    const { publisher, relay } = setup();

    await publisher.publish('a.b.c', {});

    expect(relay.trigger).toHaveBeenCalledTimes(1);
  });

  it('dentro de transação, deixa para o relay depois do commit', async () => {
    const { publisher, relay } = setup({ emTransacao: true });

    await publisher.publish('a.b.c', {});

    expect(relay.trigger).not.toHaveBeenCalled();
  });

  it('rejeita tipo fora do padrão', async () => {
    const { publisher, outboxEvent } = setup();

    await expect(publisher.publish('venda-paga', {})).rejects.toThrow('Tipo de mensagem inválido');
    expect(outboxEvent.create).not.toHaveBeenCalled();
  });

  it('rejeita payload com dado pessoal', async () => {
    const { publisher, outboxEvent } = setup();

    await expect(
      publisher.publish('comercial.paciente.criado', { pacienteId: 'p', paciente: { cpf: '1' } }),
    ).rejects.toThrow('"paciente.cpf", que é dado pessoal');
    expect(outboxEvent.create).not.toHaveBeenCalled();
  });
});
