import { Module } from '@nestjs/common';
import { loadStorageConfig } from '../storage/storage.config';
import { BackupAlertaService } from './backup-alerta.service';
import { BACKUP_DESTINO, S3DestinoBackup, type DestinoBackup } from './backup-destino';
import { BackupRegistroService } from './backup-registro.service';
import { BackupAgendador } from './backup.agendador';
import { BACKUP_CONFIG, loadBackupConfig, type BackupConfig } from './backup.config';
import { BackupController } from './backup.controller';
import { BACKUP_ORIGEM_ARQUIVOS, BackupService } from './backup.service';
import {
  PostgresFerramentas,
  PROCESSO_RUNNER,
  SpawnProcessoRunner,
  type ProcessoRunner,
} from './postgres-ferramentas';

/**
 * Backup automático, redundância e restauração testada (issue #157, R §40). Infraestrutura
 * transversal: não pertence a um módulo do inventário e não expõe nada aos outros módulos.
 */
@Module({
  controllers: [BackupController],
  providers: [
    { provide: BACKUP_CONFIG, useFactory: () => loadBackupConfig(process.env) },
    { provide: PROCESSO_RUNNER, useClass: SpawnProcessoRunner },
    {
      provide: PostgresFerramentas,
      useFactory: (runner: ProcessoRunner) => new PostgresFerramentas(runner),
      inject: [PROCESSO_RUNNER],
    },
    {
      provide: BACKUP_DESTINO,
      useFactory: (config: BackupConfig): DestinoBackup | null =>
        config.ativo && config.destino ? new S3DestinoBackup(config.destino) : null,
      inject: [BACKUP_CONFIG],
    },
    {
      // Storage de produção (MinIO/S3). Com o driver local (dev), não há o que copiar.
      provide: BACKUP_ORIGEM_ARQUIVOS,
      useFactory: (config: BackupConfig): DestinoBackup | null => {
        if (!config.ativo) return null;
        const storage = loadStorageConfig(process.env);
        return storage.driver === 's3' && storage.s3
          ? new S3DestinoBackup({ ...storage.s3, prefixo: '' })
          : null;
      },
      inject: [BACKUP_CONFIG],
    },
    BackupRegistroService,
    BackupAlertaService,
    BackupService,
    BackupAgendador,
  ],
})
export class BackupModule {}
