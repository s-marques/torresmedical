import { BACKUP_RETENCAO_PADRAO } from '@torres/shared';

export const BACKUP_CONFIG = Symbol('BACKUP_CONFIG');

const MIN_CHAVE = 32;

export interface BackupDestinoConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Pasta dentro do bucket (sem barras nas pontas). Vazia = raiz. */
  prefixo: string;
}

export interface BackupRetencao {
  diarios: number;
  semanais: number;
  mensais: number;
}

export interface BackupConfig {
  ativo: boolean;
  /** Frase-senha que cifra dumps e arquivos antes de sair do servidor. */
  chave: string;
  destino?: BackupDestinoConfig;
  retencao: BackupRetencao;
  /** Banco de produção (origem do dump). */
  databaseUrl: string;
  /**
   * Servidor onde a restauração de teste cria o banco descartável. Padrão: o mesmo servidor do
   * banco de origem, em outro banco. O ideal é um servidor separado (issue #157).
   */
  restauracaoUrl?: string;
  /** Webhook que recebe o alerta de falha (JSON, sem dados pessoais). Opcional. */
  alertaWebhookUrl?: string;
}

function inteiroNaoNegativo(env: NodeJS.ProcessEnv, nome: string, padrao: number): number {
  const bruto = env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  const valor = Number(bruto);
  if (!Number.isInteger(valor) || valor < 0) {
    throw new Error(`${nome} deve ser um inteiro maior ou igual a zero.`);
  }
  return valor;
}

/** Lê a configuração do backup. Desligado (padrão), não exige nada; ligado, falha cedo se faltar algo. */
export function loadBackupConfig(env: NodeJS.ProcessEnv): BackupConfig {
  const ativo = env.BACKUP_ATIVO === 'on';
  const retencao: BackupRetencao = {
    diarios: inteiroNaoNegativo(env, 'BACKUP_RETENCAO_DIARIOS', BACKUP_RETENCAO_PADRAO.diarios),
    semanais: inteiroNaoNegativo(env, 'BACKUP_RETENCAO_SEMANAIS', BACKUP_RETENCAO_PADRAO.semanais),
    mensais: inteiroNaoNegativo(env, 'BACKUP_RETENCAO_MENSAIS', BACKUP_RETENCAO_PADRAO.mensais),
  };
  const base = {
    retencao,
    databaseUrl: env.DATABASE_URL ?? '',
    restauracaoUrl: env.BACKUP_RESTAURACAO_URL || undefined,
    alertaWebhookUrl: env.BACKUP_ALERTA_WEBHOOK_URL || undefined,
  };
  if (!ativo) return { ativo, chave: '', ...base };

  const obrigatoria = (nome: string): string => {
    const valor = env[nome];
    if (!valor) throw new Error(`Defina ${nome} para usar BACKUP_ATIVO=on.`);
    return valor;
  };
  const chave = obrigatoria('BACKUP_CRIPTO_CHAVE');
  if (chave.length < MIN_CHAVE) {
    throw new Error(`Defina BACKUP_CRIPTO_CHAVE com pelo menos ${MIN_CHAVE} caracteres.`);
  }
  obrigatoria('DATABASE_URL');
  return {
    ativo,
    chave,
    ...base,
    destino: {
      endpoint: env.BACKUP_DESTINO_ENDPOINT || undefined,
      region: env.BACKUP_DESTINO_REGION ?? 'us-east-1',
      bucket: obrigatoria('BACKUP_DESTINO_BUCKET'),
      accessKeyId: obrigatoria('BACKUP_DESTINO_ACCESS_KEY'),
      secretAccessKey: obrigatoria('BACKUP_DESTINO_SECRET_KEY'),
      prefixo: (env.BACKUP_DESTINO_PREFIXO ?? '').replace(/^\/+|\/+$/g, ''),
    },
  };
}
