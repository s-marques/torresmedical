import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { agendadorLigado } from '../../comercial-atendimento/campanhas/campanhas.agendador';
import { hojeNaClinica } from './inadimplencia.service';
import { ReguaCobrancaService } from './regua-cobranca.service';

/**
 * Rodada da régua de cobrança (issue #166): toda hora cheia das 8h às 18h (fuso da clínica). A
 * primeira rodada do dia envia; as seguintes não repetem nada (um aviso por título e marco), mas
 * recuperam o dia se a API estava fora das 8h. `CAMPANHAS_AGENDADOR=off` desliga.
 */
@Injectable()
export class InadimplenciaAgendador {
  private readonly logger = new Logger(InadimplenciaAgendador.name);
  private rodando = false;

  constructor(
    private readonly cls: ClsService,
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly regua: ReguaCobrancaService,
  ) {}

  @Cron('0 8-18 * * *', { name: 'regua-cobranca', timeZone: 'America/Sao_Paulo' })
  async aCadaHora(): Promise<void> {
    if (!agendadorLigado() || this.rodando) return;
    this.rodando = true;
    try {
      await this.rodar(hojeNaClinica());
    } finally {
      this.rodando = false;
    }
  }

  /** Uma rodada completa, na própria transação (público para os testes). */
  async rodar(hoje: string): Promise<number> {
    try {
      const total = await this.cls.run(() =>
        this.txHost.withTransaction(() => this.regua.executar(hoje)),
      );
      if (total > 0) this.logger.log({ total }, 'Régua de cobrança');
      return total;
    } catch (erro) {
      // Só o tipo/código do erro: a mensagem pode trazer valores (dados pessoais).
      const codigo = (erro as { code?: unknown }).code;
      this.logger.error(
        {
          erro: erro instanceof Error ? erro.name : 'Erro',
          ...(typeof codigo === 'string' ? { codigo } : {}),
        },
        'Falha na régua de cobrança',
      );
      return 0;
    }
  }
}
