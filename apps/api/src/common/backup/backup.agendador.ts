import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { BackupTipo } from '@torres/shared';
import { BackupService } from './backup.service';

/**
 * Backup diário (padrão 2h, fuso da clínica) e restauração de teste semanal (padrão domingo, 4h).
 * Os horários vêm de `BACKUP_CRON` e `BACKUP_RESTAURACAO_CRON` (formato cron); `BACKUP_ATIVO=on`
 * liga tudo. Desligado, o agendador não faz nada.
 */
@Injectable()
export class BackupAgendador {
  private readonly logger = new Logger(BackupAgendador.name);

  constructor(private readonly backup: BackupService) {}

  @Cron(process.env.BACKUP_CRON || '0 2 * * *', {
    name: 'backup-diario',
    timeZone: 'America/Sao_Paulo',
  })
  backupDiario(): Promise<void> {
    return this.rodar('BACKUP');
  }

  @Cron(process.env.BACKUP_RESTAURACAO_CRON || '0 4 * * 0', {
    name: 'backup-restauracao-teste',
    timeZone: 'America/Sao_Paulo',
  })
  restauracaoSemanal(): Promise<void> {
    return this.rodar('RESTAURACAO_TESTE');
  }

  /** Público para os testes. */
  async rodar(tipo: BackupTipo): Promise<void> {
    if (!this.backup.ativo) return;
    try {
      const { concluida } = await this.backup.disparar(tipo, 'AGENDADO');
      await concluida;
    } catch (erro) {
      // Já tem execução em andamento (ou o registro não gravou): o log basta, o próximo ciclo tenta de novo.
      this.logger.error(
        { tipo, erro: erro instanceof Error ? erro.name : 'Erro' },
        'Execução agendada não iniciou',
      );
    }
  }
}
