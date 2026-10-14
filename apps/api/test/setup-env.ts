import { resolveTestDatabaseUrl } from './test-database';

// Os testes usam o banco de teste: DATABASE_URL_TEST (local) ou DATABASE_URL (CI).
const url = resolveTestDatabaseUrl(process.env);
if (url) process.env.DATABASE_URL = url;

// Logs HTTP só atrapalham a saída dos testes. Para depurar, defina TEST_LOG_LEVEL.
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
