import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BackupErro, BackupTipo } from '@torres/shared';
import { BACKUP_CONFIG, type BackupConfig } from './backup.config';

const TIMEOUT_WEBHOOK_MS = 10_000;

/**
 * Alerta de falha do backup (issue #157, critério "falha de backup gera alerta"). Sempre grava um
 * log de erro com `alerta: 'BACKUP_FALHOU'` (para o monitoramento do servidor) e, se
 * `BACKUP_ALERTA_WEBHOOK_URL` estiver definida, avisa o webhook. O conteúdo é só o tipo, o código
 * de erro e o id da execução: nunca dados do banco nem a mensagem do erro.
 */
@Injectable()
export class BackupAlertaService {
  private readonly logger = new Logger(BackupAlertaService.name);

  constructor(@Inject(BACKUP_CONFIG) private readonly config: BackupConfig) {}

  async falha(tipo: BackupTipo, codigo: BackupErro, execucaoId: string): Promise<void> {
    this.logger.error({ alerta: 'BACKUP_FALHOU', tipo, codigo, execucaoId }, 'Falha no backup');
    const url = this.config.alertaWebhookUrl;
    if (!url) return;
    try {
      const resposta = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          evento: 'backup.falhou',
          tipo,
          codigo,
          execucaoId,
          ocorridoEm: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(TIMEOUT_WEBHOOK_MS),
      });
      if (!resposta.ok) {
        this.logger.error({ status: resposta.status }, 'O webhook de alerta recusou o aviso');
      }
    } catch (erro) {
      this.logger.error(
        { erro: erro instanceof Error ? erro.name : 'Erro' },
        'Não foi possível enviar o alerta de backup ao webhook',
      );
    }
  }
}
