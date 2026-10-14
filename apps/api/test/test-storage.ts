import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Segredo fixo dos testes, usado quando o ambiente não define um. */
export const TEST_URL_SECRET = 'segredo-de-teste-das-urls-de-download-0001';

/**
 * Variáveis de storage dos testes. Os e2e gravam arquivos: no S3 só rodam em bucket cujo
 * nome termina com "-test"; no driver local, numa pasta temporária.
 */
export function resolveTestStorageEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const patch: NodeJS.ProcessEnv = {
    STORAGE_URL_SECRET: env.STORAGE_URL_SECRET ?? TEST_URL_SECRET,
  };

  if (env.STORAGE_DRIVER === 's3') {
    const bucket = env.STORAGE_S3_BUCKET_TEST ?? env.STORAGE_S3_BUCKET ?? '';
    if (!bucket.endsWith('-test')) {
      throw new Error(
        `Os testes só rodam em bucket cujo nome termina com "-test" (recebido: "${bucket}"). ` +
          'Defina STORAGE_S3_BUCKET_TEST.',
      );
    }
    patch.STORAGE_S3_BUCKET = bucket;
  } else {
    patch.STORAGE_LOCAL_DIR = join(tmpdir(), 'torres-storage-test');
  }
  return patch;
}
