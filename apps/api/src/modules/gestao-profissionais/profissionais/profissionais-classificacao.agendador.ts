import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import { agendadorLigado } from '../../comercial-atendimento/campanhas/campanhas.agendador';
import { ProfissionaisClassificacaoService } from './profissionais-classificacao.service';

/**
 * Todo dia, às 3h (fuso da clínica): reclassifica os parceiros (issue #143). O cálculo olha os
 * 30 dias até ontem, então a madrugada pega o dia anterior fechado. `CAMPANHAS_AGENDADOR=off`
 * desliga (testes e2e e instâncias só de leitura).
 */
@Injectable()
export class ProfissionaisClassificacaoAgendador {
  private readonly logger = new Logger(ProfissionaisClassificacaoAgendador.name);
  private rodando = false;

  constructor(
    private readonly cls: ClsService,
    private readonly classificacao: ProfissionaisClassificacaoService,
  ) {}

  @Cron('0 3 * * *', { name: 'classificacao-parceiro', timeZone: 'America/Sao_Paulo' })
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
      const { avaliados, alterados } = await this.cls.run(() =>
        this.classificacao.recalcular(agora),
      );
      this.logger.log({ avaliados, alterados }, 'Classificação do parceiro recalculada');
    } catch (erro) {
      // Só o tipo/código do erro: a mensagem pode trazer valores (dados pessoais).
      const codigo = (erro as { code?: unknown }).code;
      this.logger.error(
        {
          erro: erro instanceof Error ? erro.name : 'Erro',
          ...(typeof codigo === 'string' ? { codigo } : {}),
        },
        'Falha ao recalcular a classificação do parceiro',
      );
    }
  }
}
