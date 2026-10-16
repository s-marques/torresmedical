import { Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import type { ChannelModel } from 'amqplib';
import { EventEmitter } from 'node:events';
import type { MessagingConfig } from './messaging.config';
import {
  MessagingConnection,
  MessagingUnavailableError,
  PUBLISH_TIMEOUT_MS,
} from './messaging.connection';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

type Confirm = (err: unknown) => void;

class CanalFalso extends EventEmitter {
  assertExchange = jest.fn().mockResolvedValue({});
  /** Por padrão o broker confirma na hora. */
  responder: (confirm: Confirm) => void = (confirm) => confirm(null);
  publish = jest.fn(
    (_ex: string, _rk: string, _content: Buffer, _opts: unknown, confirm: Confirm) => {
      this.responder(confirm);
      return true;
    },
  );
}

class ModeloFalso extends EventEmitter {
  canais: CanalFalso[] = [];
  createConfirmChannel = jest.fn(async () => {
    const canal = new CanalFalso();
    this.canais.push(canal);
    return canal;
  });
}

class ConexaoFalsa extends EventEmitter {
  waitForConnect = jest.fn().mockResolvedValue(this);
  close = jest.fn().mockResolvedValue(undefined);
}

const CONFIG = { url: 'amqp://rabbitmq' } as MessagingConfig;

async function setup() {
  const conexao = new ConexaoFalsa();
  jest.mocked(amqp.connect).mockResolvedValue(conexao as never);
  const messaging = new MessagingConnection(CONFIG);
  await messaging.connect();
  const [, opcoes] = jest.mocked(amqp.connect).mock.calls.at(-1) as unknown as [
    string,
    { recovery: { setup: (model: ChannelModel) => Promise<void>; waitForConnect: boolean } },
  ];
  const modelo = new ModeloFalso();
  /** Simula a (re)conexão: o amqplib roda o setup e emite connect. */
  const conectar = async (m = modelo) => {
    await opcoes.recovery.setup(m as unknown as ChannelModel);
    conexao.emit('connect', m);
  };
  return { messaging, conexao, modelo, conectar, opcoes };
}

describe('MessagingConnection', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('conecta com recuperação automática, sem esperar o broker', async () => {
    const { messaging, opcoes } = await setup();

    expect(amqp.connect).toHaveBeenCalledWith('amqp://rabbitmq', expect.anything());
    expect(opcoes.recovery.waitForConnect).toBe(false);
    expect(messaging.isConnected()).toBe(false);
  });

  it('publica com confirmação, declarando o exchange topic uma vez', async () => {
    const { messaging, modelo, conectar } = await setup();
    await conectar();
    const conteudo = Buffer.from('{}');

    await messaging.publish('torres.comercial', 'comercial.venda.paga', conteudo, {
      messageId: 'e-1',
    });
    await messaging.publish('torres.comercial', 'comercial.venda.paga', conteudo);

    const [canal] = modelo.canais;
    expect(modelo.createConfirmChannel).toHaveBeenCalledTimes(1);
    expect(canal?.assertExchange).toHaveBeenCalledTimes(1);
    expect(canal?.assertExchange).toHaveBeenCalledWith('torres.comercial', 'topic', {
      durable: true,
    });
    expect(canal?.publish).toHaveBeenCalledWith(
      'torres.comercial',
      'comercial.venda.paga',
      conteudo,
      { persistent: true, contentType: 'application/json', messageId: 'e-1' },
      expect.any(Function),
    );
  });

  it('entrega direto na fila pelo exchange padrão, sem declarar exchange', async () => {
    const { messaging, modelo, conectar } = await setup();
    await conectar();

    await messaging.publish('', 'fila.retry', Buffer.from('{}'));

    expect(modelo.canais[0]?.assertExchange).not.toHaveBeenCalled();
  });

  it('falha quando o broker recusa ou não confirma no prazo', async () => {
    const { messaging, modelo, conectar } = await setup();
    await conectar();
    await messaging.publish('', 'q.a', Buffer.from('{}'));
    const canal = modelo.canais[0] as CanalFalso;

    canal.responder = (confirm) => confirm(new Error('nack'));
    await expect(messaging.publish('', 'q.a', Buffer.from('{}'))).rejects.toThrow('nack');

    canal.responder = (confirm) => confirm('recusado');
    await expect(messaging.publish('', 'q.a', Buffer.from('{}'))).rejects.toThrow('recusada');

    jest.useFakeTimers();
    canal.responder = () => undefined;
    const pendente = messaging.publish('', 'q.a', Buffer.from('{}'));
    const verificacao = expect(pendente).rejects.toThrow('Sem confirmação');
    await jest.advanceTimersByTimeAsync(PUBLISH_TIMEOUT_MS);
    await verificacao;
  });

  it('sem conexão, publish falha com MessagingUnavailableError', async () => {
    const { messaging, modelo, conectar } = await setup();

    await expect(messaging.publish('', 'q.a', Buffer.from('{}'))).rejects.toBeInstanceOf(
      MessagingUnavailableError,
    );

    await conectar();
    modelo.emit('close');
    await expect(messaging.publish('', 'q.a', Buffer.from('{}'))).rejects.toBeInstanceOf(
      MessagingUnavailableError,
    );
    expect(messaging.isConnected()).toBe(false);
  });

  it('recria o canal de publicação fechado por erro', async () => {
    const { messaging, modelo, conectar } = await setup();
    await conectar();
    await messaging.publish('torres.a', 'a.b.c', Buffer.from('{}'));

    modelo.canais[0]?.emit('error', new Error('PRECONDITION_FAILED'));
    modelo.canais[0]?.emit('close');
    await messaging.publish('torres.a', 'a.b.c', Buffer.from('{}'));

    expect(modelo.createConfirmChannel).toHaveBeenCalledTimes(2);
    // O exchange é declarado de novo no canal novo.
    expect(modelo.canais[1]?.assertExchange).toHaveBeenCalledTimes(1);
  });

  it('roda as montagens registradas a cada conexão, em ordem', async () => {
    const { messaging, conectar } = await setup();
    const ordem: string[] = [];
    messaging.onConnect(async () => void ordem.push('a'));
    messaging.onConnect(async () => void ordem.push('b'));

    await conectar();
    await conectar(new ModeloFalso());

    expect(ordem).toEqual(['a', 'b', 'a', 'b']);
  });

  it('se a montagem falhar, propaga o erro (o amqplib reconecta) e fica indisponível', async () => {
    const { messaging, opcoes, modelo } = await setup();
    messaging.onConnect(() => Promise.reject(new Error('fila com argumentos diferentes')));

    await expect(opcoes.recovery.setup(modelo as unknown as ChannelModel)).rejects.toThrow(
      'argumentos diferentes',
    );
    await expect(messaging.publish('', 'q.a', Buffer.from('{}'))).rejects.toBeInstanceOf(
      MessagingUnavailableError,
    );
  });

  it('acompanha o estado da conexão e fecha no shutdown', async () => {
    const { messaging, conexao, conectar } = await setup();

    await conectar();
    expect(messaging.isConnected()).toBe(true);
    conexao.emit('disconnect', new Error('caiu'));
    expect(messaging.isConnected()).toBe(false);
    conexao.emit('connect-failed', new Error('recusada'));
    conexao.emit('error', new Error('erro'));

    await messaging.waitForConnect();
    expect(conexao.waitForConnect).toHaveBeenCalled();
    await messaging.close();
    expect(conexao.close).toHaveBeenCalled();
    await expect(messaging.close()).resolves.toBeUndefined();
  });
});
