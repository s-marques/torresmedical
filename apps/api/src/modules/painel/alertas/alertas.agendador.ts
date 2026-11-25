import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import { agendadorLigado } from '../../comercial-atendimento/campanhas/campanhas.agendador';
import { AlertasService } from './alertas.service';

/**
 * Todo dia, às 6h (fuso da clínica): recalcula os contadores da central de notificações (issue
 * #160). Na subida da API recalcula também, se o dia ainda não tem contadores (API parada na
 * madrugada). `CAMPANHAS_AGENDADOR=off` desliga (testes e2e e instâncias só de leitura).
 */
@Injectable()
export class AlertasAgendador implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlertasAgendador.name);
  private rodando = false;

  constructor(
    private readonly cls: ClsService,
    private readonly alertas: AlertasService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!agendadorLigado()) return;
    try {
      const pendente = await this.cls.run(async () => !(await this.alertas.temDoDia()));
      if (pendente) await this.rodar(new Date());
    } catch (erro) {
      this.registrarFalha(erro);
    }
  }

  @Cron('0 6 * * *', { name: 'alertas-do-dia', timeZone: 'America/Sao_Paulo' })
  async todoDia(): Promise<void> {
    if (!agendadorLigado() || this.rodando) return;
    this.rodando = true;
    try {
      await this.rodar(new Date());
    } finally {
      this.rodando = false;
    }
  }

  /** Uma rodada completa (público para os testes). */
  async rodar(agora: Date): Promise<void> {
    try {
      const tipos = await this.cls.run(() => this.alertas.recalcular(agora));
      this.logger.log({ tipos: tipos.length }, 'Alertas do dia recalculados');
    } catch (erro) {
      this.registrarFalha(erro);
    }
  }

  private registrarFalha(erro: unknown): void {
    // Só o tipo/código do erro: a mensagem pode trazer valores (dados pessoais).
    const codigo = (erro as { code?: unknown }).code;
    this.logger.error(
      {
        erro: erro instanceof Error ? erro.name : 'Erro',
        ...(typeof codigo === 'string' ? { codigo } : {}),
      },
      'Falha ao recalcular os alertas do dia',
    );
  }
}
