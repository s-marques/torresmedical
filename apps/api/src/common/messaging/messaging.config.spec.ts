import { loadMessagingConfig, retryDelayMs } from './messaging.config';

const URL = 'amqp://torres:senha@rabbitmq:5672';

describe('loadMessagingConfig', () => {
  it('usa os padrões quando só a URL é informada', () => {
    expect(loadMessagingConfig({ RABBITMQ_URL: URL })).toEqual({
      url: URL,
      maxAttempts: 5,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 60000,
      prefetch: 10,
      outboxIntervalMs: 1000,
      outboxBatchSize: 50,
      processedRetentionDays: 30,
    });
  });

  it('lê os valores do ambiente', () => {
    const config = loadMessagingConfig({
      RABBITMQ_URL: URL,
      MESSAGING_MAX_ATTEMPTS: '3',
      MESSAGING_RETRY_BASE_MS: '50',
      MESSAGING_RETRY_MAX_MS: '200',
    });
    expect(config).toMatchObject({ maxAttempts: 3, retryBaseDelayMs: 50, retryMaxDelayMs: 200 });
  });

  it('exige RABBITMQ_URL', () => {
    expect(() => loadMessagingConfig({})).toThrow('Defina RABBITMQ_URL');
  });

  it.each(['0', '-1', '1.5', 'abc'])('rejeita número inválido (%s)', (valor) => {
    expect(() => loadMessagingConfig({ RABBITMQ_URL: URL, MESSAGING_PREFETCH: valor })).toThrow(
      'MESSAGING_PREFETCH deve ser um inteiro positivo.',
    );
  });

  it('rejeita espera máxima menor que a inicial', () => {
    expect(() =>
      loadMessagingConfig({
        RABBITMQ_URL: URL,
        MESSAGING_RETRY_BASE_MS: '500',
        MESSAGING_RETRY_MAX_MS: '100',
      }),
    ).toThrow('MESSAGING_RETRY_MAX_MS');
  });
});

describe('retryDelayMs', () => {
  const config = { retryBaseDelayMs: 1000, retryMaxDelayMs: 5000 };

  it('dobra a cada falha, até o máximo', () => {
    expect([1, 2, 3, 4, 5].map((falhas) => retryDelayMs(falhas, config))).toEqual([
      1000, 2000, 4000, 5000, 5000,
    ]);
  });
});
