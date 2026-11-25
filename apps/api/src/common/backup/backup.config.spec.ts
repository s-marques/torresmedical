import { loadBackupConfig } from './backup.config';

const CHAVE = 'x'.repeat(32);
const ATIVO = {
  BACKUP_ATIVO: 'on',
  BACKUP_CRIPTO_CHAVE: CHAVE,
  DATABASE_URL: 'postgresql://u:p@postgres:5432/torres',
  BACKUP_DESTINO_BUCKET: 'torres-backup',
  BACKUP_DESTINO_ACCESS_KEY: 'chave',
  BACKUP_DESTINO_SECRET_KEY: 'segredo',
};

describe('loadBackupConfig', () => {
  it('vem desligado por padrão e não exige nada', () => {
    const config = loadBackupConfig({});
    expect(config.ativo).toBe(false);
    expect(config.destino).toBeUndefined();
    expect(config.retencao).toEqual({ diarios: 7, semanais: 4, mensais: 6 });
  });

  it('só liga com BACKUP_ATIVO=on', () => {
    expect(loadBackupConfig({ ...ATIVO, BACKUP_ATIVO: 'true' }).ativo).toBe(false);
  });

  it('lê o destino, a retenção e o webhook quando ligado', () => {
    const config = loadBackupConfig({
      ...ATIVO,
      BACKUP_DESTINO_ENDPOINT: 'https://s3.exemplo.test',
      BACKUP_DESTINO_PREFIXO: '/torres/prod/',
      BACKUP_RETENCAO_DIARIOS: '14',
      BACKUP_RETENCAO_SEMANAIS: '0',
      BACKUP_ALERTA_WEBHOOK_URL: 'https://alerta.exemplo.test/hook',
      BACKUP_RESTAURACAO_URL: 'postgresql://u:p@teste:5432/postgres',
    });
    expect(config).toMatchObject({
      ativo: true,
      chave: CHAVE,
      retencao: { diarios: 14, semanais: 0, mensais: 6 },
      alertaWebhookUrl: 'https://alerta.exemplo.test/hook',
      restauracaoUrl: 'postgresql://u:p@teste:5432/postgres',
      destino: {
        endpoint: 'https://s3.exemplo.test',
        region: 'us-east-1',
        bucket: 'torres-backup',
        prefixo: 'torres/prod',
      },
    });
  });

  it.each([
    ['BACKUP_CRIPTO_CHAVE'],
    ['DATABASE_URL'],
    ['BACKUP_DESTINO_BUCKET'],
    ['BACKUP_DESTINO_ACCESS_KEY'],
    ['BACKUP_DESTINO_SECRET_KEY'],
  ])('falha cedo sem %s', (nome) => {
    const env: NodeJS.ProcessEnv = { ...ATIVO };
    delete env[nome];
    expect(() => loadBackupConfig(env)).toThrow(nome);
  });

  it('recusa chave curta e retenção inválida', () => {
    expect(() => loadBackupConfig({ ...ATIVO, BACKUP_CRIPTO_CHAVE: 'curta' })).toThrow('32');
    expect(() => loadBackupConfig({ ...ATIVO, BACKUP_RETENCAO_DIARIOS: '-1' })).toThrow(
      'BACKUP_RETENCAO_DIARIOS',
    );
    expect(() => loadBackupConfig({ ...ATIVO, BACKUP_RETENCAO_MENSAIS: 'abc' })).toThrow(
      'BACKUP_RETENCAO_MENSAIS',
    );
  });
});
