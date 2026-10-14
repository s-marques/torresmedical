/**
 * Escolhe o banco dos testes e impede rodar contra outro que não seja de teste,
 * porque os e2e apagam dados.
 */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv): string | undefined {
  const url = env.DATABASE_URL_TEST ?? env.DATABASE_URL;
  if (!url) return undefined;

  const database = new URL(url).pathname.replace(/^\//, '');
  if (!database.endsWith('_test')) {
    throw new Error(
      `Os testes só rodam em banco cujo nome termina com "_test" (recebido: "${database}"). ` +
        'Defina DATABASE_URL_TEST.',
    );
  }
  return url;
}
