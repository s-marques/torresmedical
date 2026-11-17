import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { EnviosCampanhaService } from './envios-campanha.service';
import { agoraNaClinica, type AgoraClinica } from './relogio-clinica';

/** `CAMPANHAS_AGENDADOR=off` desliga o agendador (testes e2e e instâncias só de leitura). */
export function agendadorLigado(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CAMPANHAS_AGENDADOR !== 'off';
}

/**
 * A cada minuto: dispara campanhas e mensagens automáticas devidas e grava no WhatsApp os
 * envios cuja hora chegou. Cada passo roda na sua transação; erro num passo não para os outros.
 */
@Injectable()
export class CampanhasAgendador {
  private readonly logger = new Logger(CampanhasAgendador.name);
  private rodando = false;

  constructor(
    private readonly cls: ClsService,
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly envios: EnviosCampanhaService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'campanhas' })
  async aCadaMinuto(): Promise<void> {
    if (!agendadorLigado() || this.rodando) return;
    this.rodando = true;
    try {
      await this.rodar(agoraNaClinica());
    } finally {
      this.rodando = false;
    }
  }

  /** Uma rodada completa (público para os testes). */
  async rodar(agora: AgoraClinica): Promise<void> {
    await this.passo('disparar-campanhas', () => this.envios.dispararCampanhas(agora));
    await this.passo('disparar-automacoes', () => this.envios.dispararAutomacoes(agora));
    await this.passo('enfileirar', () => this.envios.enfileirar(agora));
  }

  private async passo(nome: string, executar: () => Promise<number>): Promise<void> {
    try {
      const total = await this.cls.run(() => this.txHost.withTransaction(executar));
      if (total > 0) this.logger.log({ passo: nome, total }, 'Agendador de campanhas');
    } catch (erro) {
      // Só o passo e o tipo/código do erro: a mensagem pode trazer valores (dados pessoais).
      const codigo = (erro as { code?: unknown }).code;
      this.logger.error(
        {
          passo: nome,
          erro: erro instanceof Error ? erro.name : 'Erro',
          ...(typeof codigo === 'string' ? { codigo } : {}),
        },
        'Falha no agendador de campanhas',
      );
    }
  }
}
