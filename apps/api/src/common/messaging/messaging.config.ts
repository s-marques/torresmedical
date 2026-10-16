export interface MessagingConfig {
  /** URL AMQP do RabbitMQ (`RABBITMQ_URL`). */
  url: string;
  /** Tentativas de processamento de uma mensagem antes de ir para a DLQ (inclui a primeira). */
  maxAttempts: number;
  /** Espera antes da 1ª nova tentativa, em ms. Dobra a cada tentativa, até `retryMaxDelayMs`. */
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  /** Mensagens entregues a cada consumidor sem confirmação (prefetch). */
  prefetch: number;
  /** Intervalo de varredura da outbox, em ms. */
  outboxIntervalMs: number;
  /** Eventos publicados por varredura da outbox. */
  outboxBatchSize: number;
  /** Por quantos dias `processed_events` guarda um evento processado (janela da idempotência). */
  processedRetentionDays: number;
}

export const MESSAGING_CONFIG = Symbol('MESSAGING_CONFIG');

const DEFAULTS = {
  MESSAGING_MAX_ATTEMPTS: 5,
  MESSAGING_RETRY_BASE_MS: 1_000,
  MESSAGING_RETRY_MAX_MS: 60_000,
  MESSAGING_PREFETCH: 10,
  MESSAGING_OUTBOX_INTERVAL_MS: 1_000,
  MESSAGING_OUTBOX_BATCH_SIZE: 50,
  MESSAGING_PROCESSED_RETENTION_DAYS: 30,
} as const;

/** Lê a configuração da mensageria das variáveis de ambiente e falha cedo se faltar algo. */
export function loadMessagingConfig(env: NodeJS.ProcessEnv): MessagingConfig {
  const url = env.RABBITMQ_URL;
  if (!url) throw new Error('Defina RABBITMQ_URL (ex.: amqp://usuario:senha@rabbitmq:5672).');

  const int = (name: keyof typeof DEFAULTS): number => {
    const value = Number(env[name] ?? DEFAULTS[name]);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} deve ser um inteiro positivo.`);
    }
    return value;
  };

  const config: MessagingConfig = {
    url,
    maxAttempts: int('MESSAGING_MAX_ATTEMPTS'),
    retryBaseDelayMs: int('MESSAGING_RETRY_BASE_MS'),
    retryMaxDelayMs: int('MESSAGING_RETRY_MAX_MS'),
    prefetch: int('MESSAGING_PREFETCH'),
    outboxIntervalMs: int('MESSAGING_OUTBOX_INTERVAL_MS'),
    outboxBatchSize: int('MESSAGING_OUTBOX_BATCH_SIZE'),
    processedRetentionDays: int('MESSAGING_PROCESSED_RETENTION_DAYS'),
  };
  if (config.retryMaxDelayMs < config.retryBaseDelayMs) {
    throw new Error('MESSAGING_RETRY_MAX_MS deve ser maior ou igual a MESSAGING_RETRY_BASE_MS.');
  }
  return config;
}

/** Backoff exponencial: espera antes da nova tentativa depois de `failedAttempts` falhas. */
export function retryDelayMs(
  failedAttempts: number,
  config: Pick<MessagingConfig, 'retryBaseDelayMs' | 'retryMaxDelayMs'>,
): number {
  const delay = config.retryBaseDelayMs * 2 ** Math.max(0, failedAttempts - 1);
  return Math.min(delay, config.retryMaxDelayMs);
}
