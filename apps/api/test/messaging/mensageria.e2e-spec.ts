import { fakerPT_BR as faker } from '@faker-js/faker';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DeliveryHandler, type DeliveryOutcome } from '../../src/common/messaging/delivery-handler';
import { EventPublisher } from '../../src/common/messaging/event-publisher';
import { createEnvelope } from '../../src/common/messaging/message-envelope';
import { MessagingConnection } from '../../src/common/messaging/messaging.connection';
import { dlqOf, exchangeOf } from '../../src/common/messaging/messaging-names';
import { OutboxRelay } from '../../src/common/messaging/outbox-relay';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import {
  EmpresaCriadaConsumer,
  EVENTO_EMPRESA_CRIADA,
  EVENTO_FALHA,
  FalhaConsumer,
  FILA_EMPRESA_CRIADA,
  FILA_FALHA,
  MessagingFixtureModule,
} from '../fixtures/messaging-fixture.module';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit } from '../utils/expect-audit';
import {
  apagarFilas,
  conectarRabbitTeste,
  esperarAte,
  totalNaFila,
  type RabbitTeste,
} from '../utils/rabbitmq';

const BASE = '/api/test-fixtures/mensageria/empresas';
const FILAS = [FILA_EMPRESA_CRIADA, FILA_FALHA];
const MAX_TENTATIVAS = 3;

// Retry rápido para o teste da DLQ. Lido pelo MessagingModule ao subir a aplicação.
const AMBIENTE = {
  MESSAGING_MAX_ATTEMPTS: String(MAX_TENTATIVAS),
  MESSAGING_RETRY_BASE_MS: '50',
  MESSAGING_RETRY_MAX_MS: '200',
  MESSAGING_OUTBOX_INTERVAL_MS: '100',
};

function novaEmpresa() {
  return { nome: faker.company.name(), documento: faker.string.numeric(14) };
}

describe('Mensageria: RabbitMQ, outbox e consumidor padrão (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rabbit: RabbitTeste;
  let usuario: UsuarioTeste;
  let consumidor: EmpresaCriadaConsumer;
  let falha: FalhaConsumer;
  /** Resultado de cada entrega, por eventId. */
  let resultados: Map<string, DeliveryOutcome[]>;
  const ambienteOriginal = { ...process.env };

  beforeAll(async () => {
    Object.assign(process.env, AMBIENTE);
    rabbit = await conectarRabbitTeste();
    await apagarFilas(rabbit.channel, FILAS);

    app = await createE2eApp({ imports: [MessagingFixtureModule] });
    prisma = app.get(PrismaService);
    consumidor = app.get(EmpresaCriadaConsumer);
    falha = app.get(FalhaConsumer);
    await app.get(MessagingConnection).waitForConnect();

    const delivery = app.get(DeliveryHandler);
    const handle = delivery.handle.bind(delivery);
    jest.spyOn(delivery, 'handle').mockImplementation(async (channel, message, entry) => {
      const outcome = await handle(channel, message, entry);
      const eventId = String(message.properties.messageId);
      resultados.set(eventId, [...(resultados.get(eventId) ?? []), outcome]);
      return outcome;
    });
  });

  beforeEach(async () => {
    resultados = new Map();
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app);
  });

  afterAll(async () => {
    await app.close();
    await apagarFilas(rabbit.channel, FILAS);
    await rabbit.close();
    process.env = ambienteOriginal;
  });

  it('health mostra a mensageria no ar', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(res.body.checks).toEqual({ mensageria: 'up' });
  });

  it('evento de exemplo: publicado após o commit e consumido (ponta a ponta)', async () => {
    const res = await comUsuario(app, usuario).post(BASE).send(novaEmpresa()).expect(201);
    const empresaId = (res.body as { id: string }).id;

    const processado = await esperarAte(() => prisma.processedEvent.findFirst());
    expect(processado).toMatchObject({ consumer: FILA_EMPRESA_CRIADA });
    expect(consumidor.processados).toContain(processado.eventId);
    expect(resultados.get(processado.eventId)).toEqual(['processed']);
    // A outbox é esvaziada depois da confirmação do broker.
    expect(await prisma.outboxEvent.count()).toBe(0);
    // O consumidor encontrou a empresa commitada e auditou com o usuário do evento.
    await expectAudit(prisma, {
      action: 'CREATE',
      entity: 'ExemploRecebimento',
      entityId: empresaId,
      after: { empresaEncontrada: true },
      userId: usuario.id,
    });
  });

  it('não publica o evento quando a transação é desfeita', async () => {
    await comUsuario(app, usuario).post(`${BASE}/falha`).send(novaEmpresa()).expect(400);
    await app.get(OutboxRelay).flush();
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Só a empresa do usuário de teste: a da requisição foi desfeita.
    expect(await prisma.empresa.count()).toBe(1);
    expect(await prisma.outboxEvent.count()).toBe(0);
    expect(resultados.size).toBe(0);
  });

  it('mensagem duplicada não é processada duas vezes', async () => {
    const envelope = createEnvelope(
      EVENTO_EMPRESA_CRIADA,
      { empresaId: randomUUID() },
      {
        userId: usuario.id,
      },
    );
    const conteudo = Buffer.from(JSON.stringify(envelope));
    for (let i = 0; i < 2; i++) {
      rabbit.channel.publish(exchangeOf(EVENTO_EMPRESA_CRIADA), EVENTO_EMPRESA_CRIADA, conteudo, {
        messageId: envelope.eventId,
      });
    }

    const entregas = await esperarAte(() => {
      const lista = resultados.get(envelope.eventId) ?? [];
      return lista.length === 2 ? lista : undefined;
    });
    expect([...entregas].sort()).toEqual(['duplicate', 'processed']);
    expect(consumidor.processados.filter((id) => id === envelope.eventId)).toHaveLength(1);
    expect(await prisma.processedEvent.count({ where: { eventId: envelope.eventId } })).toBe(1);
  });

  it(`mensagem com erro vai para a DLQ após ${MAX_TENTATIVAS} tentativas`, async () => {
    const tentativasAntes = falha.tentativas;
    const envelope = await app.get(EventPublisher).publish(EVENTO_FALHA, { registroId: '1' });

    const entregas = await esperarAte(() => {
      const lista = resultados.get(envelope.eventId) ?? [];
      return lista.length === MAX_TENTATIVAS ? lista : undefined;
    });
    expect(entregas).toEqual(['retry', 'retry', 'dead-letter']);
    expect(falha.tentativas - tentativasAntes).toBe(MAX_TENTATIVAS);
    expect(await prisma.processedEvent.count()).toBe(0);

    const naDlq = await esperarAte(() => rabbit.channel.get(dlqOf(FILA_FALHA), { noAck: true }));
    expect(JSON.parse(naDlq.content.toString())).toMatchObject({ eventId: envelope.eventId });
    expect(naDlq.properties.headers).toMatchObject({
      'x-attempts': MAX_TENTATIVAS,
      'x-error': 'Error',
    });
    expect(await totalNaFila(rabbit.channel, FILA_FALHA)).toBe(0);
  });

  it('mensagem fora do envelope vai direto para a DLQ, sem nova tentativa', async () => {
    const tentativasAntes = falha.tentativas;
    const messageId = randomUUID();
    rabbit.channel.publish(exchangeOf(EVENTO_FALHA), EVENTO_FALHA, Buffer.from('{"x":1}'), {
      messageId,
    });

    await esperarAte(() => resultados.get(messageId));
    expect(resultados.get(messageId)).toEqual(['dead-letter']);
    expect(falha.tentativas).toBe(tentativasAntes);
    const naDlq = await esperarAte(() => rabbit.channel.get(dlqOf(FILA_FALHA), { noAck: true }));
    expect(naDlq.properties.headers).toMatchObject({ 'x-error': 'INVALID_ENVELOPE' });
  });
});
