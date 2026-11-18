import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { agendadorLigado } from '../campanhas/campanhas.agendador';
import { agoraNaClinica, type AgoraClinica } from '../campanhas/relogio-clinica';
import { EnvioConfirmacaoService } from './envio-confirmacao.service';

/** A cada minuto: envia as confirmações (MSG1/2/3 e lembrete) cuja hora chegou. */
@Injectable()
export class ConfirmacoesAgendador {
  private readonly logger = new Logger(ConfirmacoesAgendador.name);
  private rodando = false;

  constructor(
    private readonly cls: ClsService,
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly envios: EnvioConfirmacaoService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'confirmacoes' })
  async aCadaMinuto(): Promise<void> {
    if (!agendadorLigado() || this.rodando) return;
    this.rodando = true;
    try {
      await this.rodar(agoraNaClinica());
    } finally {
      this.rodando = false;
    }
  }

  /** Uma rodada (público para os testes). */
  async rodar(agora: AgoraClinica): Promise<number> {
    try {
      const total = await this.cls.run(() =>
        this.txHost.withTransaction(() => this.envios.dispararDevidos(agora)),
      );
      if (total > 0) this.logger.log({ total }, 'Agendador de confirmações');
      return total;
    } catch (erro) {
      // Só o tipo/código do erro: a mensagem pode trazer valores (dados pessoais).
      const codigo = (erro as { code?: unknown }).code;
      this.logger.error(
        {
          erro: erro instanceof Error ? erro.name : 'Erro',
          ...(typeof codigo === 'string' ? { codigo } : {}),
        },
        'Falha no agendador de confirmações',
      );
      return 0;
    }
  }
}
