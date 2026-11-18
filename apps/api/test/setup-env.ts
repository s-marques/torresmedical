import { resolveTestDatabaseUrl } from './test-database';
import { resolveTestStorageEnv } from './test-storage';

// Os testes usam o banco de teste: DATABASE_URL_TEST (local) ou DATABASE_URL (CI).
const url = resolveTestDatabaseUrl(process.env);
if (url) process.env.DATABASE_URL = url;

// E o bucket (ou a pasta) de teste do storage.
Object.assign(process.env, resolveTestStorageEnv(process.env));

// RabbitMQ dos testes: RABBITMQ_URL_TEST (opcional, ex.: outro vhost) ou RABBITMQ_URL.
if (process.env.RABBITMQ_URL_TEST) process.env.RABBITMQ_URL = process.env.RABBITMQ_URL_TEST;

// O agendador de campanhas não roda nos testes: eles chamam cada passo quando precisam.
process.env.CAMPANHAS_AGENDADOR = 'off';

// Logs HTTP só atrapalham a saída dos testes. Para depurar, defina TEST_LOG_LEVEL.
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';

// Segredo fixo dos tokens nos testes (o .env local e o CI não precisam defini-lo).
process.env.AUTH_JWT_SECRET ??= 'segredo-dos-testes-com-pelo-menos-32-caracteres';
