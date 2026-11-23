import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { agendadorLigado } from '../campanhas/campanhas.agendador';
import { agoraNaClinica, type AgoraClinica } from '../campanhas/relogio-clinica';
import { EnvioPesquisaProfissionalService } from './envio-pesquisa-profissional.service';

/** Todo dia às 09:00 (fuso da clínica): manda as pesquisas dos profissionais que chegaram aos 30 dias ou ao ciclo periódico. */
@Injectable()
export class PesquisaProfissionalAgendador {
  private readonly logger = new Logger(PesquisaProfissionalAgendador.name);
  private rodando = false;

  constructor(
    private readonly cls: ClsService,
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly envios: EnvioPesquisaProfissionalService,
  ) {}

  @Cron('0 9 * * *', { name: 'pesquisa-profissional', timeZone: 'America/Sao_Paulo' })
  async todoDia(): Promise<void> {
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
      if (total > 0) this.logger.log({ total }, 'Agendador da pesquisa do profissional');
      return total;
    } catch (erro) {
      // Só o tipo/código do erro: a mensagem pode trazer valores (dados pessoais).
      const codigo = (erro as { code?: unknown }).code;
      this.logger.error(
        {
          erro: erro instanceof Error ? erro.name : 'Erro',
          ...(typeof codigo === 'string' ? { codigo } : {}),
        },
        'Falha no agendador da pesquisa do profissional',
      );
      return 0;
    }
  }
}
