import { resolve } from 'node:path';

export type StorageDriverName = 'local' | 's3';

export interface S3StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface StorageConfig {
  driver: StorageDriverName;
  /** Pasta do driver local. */
  localDir: string;
  s3?: S3StorageConfig;
  /** Segredo do HMAC das URLs temporárias de download. */
  urlSecret: string;
  /** Validade das URLs temporárias, em segundos. */
  urlTtlSeconds: number;
}

export const STORAGE_CONFIG = Symbol('STORAGE_CONFIG');

const DEFAULT_URL_TTL_SECONDS = 300;
const MIN_SECRET_LENGTH = 32;

/** Lê a configuração do storage das variáveis de ambiente e falha cedo se faltar algo. */
export function loadStorageConfig(env: NodeJS.ProcessEnv): StorageConfig {
  const driver = (env.STORAGE_DRIVER ?? 'local') as StorageDriverName;
  if (driver !== 'local' && driver !== 's3') {
    throw new Error(`STORAGE_DRIVER inválido: "${driver}". Use "local" ou "s3".`);
  }

  const urlSecret = env.STORAGE_URL_SECRET ?? '';
  if (urlSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`Defina STORAGE_URL_SECRET com pelo menos ${MIN_SECRET_LENGTH} caracteres.`);
  }

  const ttl = Number(env.STORAGE_URL_TTL_SECONDS ?? DEFAULT_URL_TTL_SECONDS);
  if (!Number.isInteger(ttl) || ttl <= 0) {
    throw new Error('STORAGE_URL_TTL_SECONDS deve ser um inteiro positivo.');
  }

  return {
    driver,
    localDir: resolve(env.STORAGE_LOCAL_DIR ?? 'storage'),
    s3: driver === 's3' ? loadS3Config(env) : undefined,
    urlSecret,
    urlTtlSeconds: ttl,
  };
}

function loadS3Config(env: NodeJS.ProcessEnv): S3StorageConfig {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) throw new Error(`Defina ${name} para usar STORAGE_DRIVER=s3.`);
    return value;
  };
  return {
    endpoint: env.STORAGE_S3_ENDPOINT || undefined,
    region: env.STORAGE_S3_REGION ?? 'us-east-1',
    bucket: required('STORAGE_S3_BUCKET'),
    accessKeyId: required('STORAGE_S3_ACCESS_KEY'),
    secretAccessKey: required('STORAGE_S3_SECRET_KEY'),
  };
}
