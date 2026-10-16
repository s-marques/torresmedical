/**
 * Padrão de nomes da mensageria (CLAUDE.md, seção 5).
 * - Evento/comando (routing key): `<modulo>.<entidade>.<acao>`, ex.: `comercial.venda.paga`.
 * - Exchange (topic): `torres.<modulo>`, do módulo publicador (evento) ou destino (comando).
 *   Nos dois casos é o primeiro segmento da routing key.
 * - Fila: `<modulo-consumidor>.<proposito>`; DLQ `<fila>.dlq`; espera do retry `<fila>.retry`.
 */
const SEGMENT = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';

export const ROUTING_KEY_PATTERN = new RegExp(`^${SEGMENT}\\.${SEGMENT}\\.${SEGMENT}$`);
export const QUEUE_NAME_PATTERN = new RegExp(`^${SEGMENT}\\.${SEGMENT}$`);

export const EXCHANGE_PREFIX = 'torres';

export function assertRoutingKey(type: string): void {
  if (!ROUTING_KEY_PATTERN.test(type)) {
    throw new Error(
      `Tipo de mensagem inválido: "${type}". Use <modulo>.<entidade>.<acao> em kebab-case.`,
    );
  }
}

export function assertQueueName(queue: string): void {
  if (!QUEUE_NAME_PATTERN.test(queue)) {
    throw new Error(
      `Fila inválida: "${queue}". Use <modulo-consumidor>.<proposito> em kebab-case.`,
    );
  }
}

/** Exchange de uma routing key: `comercial.venda.paga` → `torres.comercial`. */
export function exchangeOf(type: string): string {
  assertRoutingKey(type);
  return `${EXCHANGE_PREFIX}.${type.split('.')[0]}`;
}

export function dlqOf(queue: string): string {
  return `${queue}.dlq`;
}

export function retryQueueOf(queue: string): string {
  return `${queue}.retry`;
}
