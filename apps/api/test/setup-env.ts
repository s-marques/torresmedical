import { resolveTestDatabaseUrl } from './test-database';

// Os testes usam o banco de teste: DATABASE_URL_TEST (local) ou DATABASE_URL (CI).
const url = resolveTestDatabaseUrl(process.env);
if (url) process.env.DATABASE_URL = url;
