import * as amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import { dlqOf, retryQueueOf } from '../../src/common/messaging/messaging-names';

/** Conexão direta com o RabbitMQ dos testes, para preparar filas e inspecionar mensagens. */
export interface RabbitTeste {
  channel: Channel;
  close(): Promise<void>;
}

export async function conectarRabbitTeste(): Promise<RabbitTeste> {
  const url = process.env.RABBITMQ_URL;
  if (!url)
    throw new Error('Defina RABBITMQ_URL (ou RABBITMQ_URL_TEST) para os e2e da mensageria.');
  const connection: ChannelModel = await amqp.connect(url);
  const channel = await connection.createChannel();
  return { channel, close: () => connection.close() };
}

/** Apaga a fila, a `.retry` e a `.dlq`, para cada teste começar sem mensagens antigas. */
export async function apagarFilas(channel: Channel, filas: readonly string[]): Promise<void> {
  for (const fila of filas) {
    for (const nome of [fila, retryQueueOf(fila), dlqOf(fila)]) await channel.deleteQueue(nome);
  }
}

export async function totalNaFila(channel: Channel, fila: string): Promise<number> {
  return (await channel.checkQueue(fila)).messageCount;
}

type Verdadeiro<T> = Exclude<T, false | null | undefined | 0 | ''>;

/** Espera `condicao` devolver um valor verdadeiro, ou falha após `timeoutMs`. */
export async function esperarAte<T>(
  condicao: () => Promise<T> | T,
  { timeoutMs = 10_000, intervaloMs = 50 } = {},
): Promise<Verdadeiro<T>> {
  const limite = Date.now() + timeoutMs;
  for (;;) {
    const valor = await condicao();
    if (valor) return valor as Verdadeiro<T>;
    if (Date.now() > limite) throw new Error(`Condição não atendida em ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, intervaloMs));
  }
}
