import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import { agendadorLigado } from '../../comercial-atendimento/campanhas/campanhas.agendador';
import { AcessoProfissionalService } from './acesso-profissional.service';

/**
 * Todo dia, às 2h (fuso da clínica): encerra o acesso dos usuários cujo profissional ficou sem
 * contrato (término natural ou fim da carência, issue #156). `CAMPANHAS_AGENDADOR=off` desliga.
 */
@Injectable()
export class AcessoProfissionalAgendador {
  private readonly logger = new Logger(AcessoProfissionalAgendador.name);
  private rodando = false;

  constructor(
    private readonly cls: ClsService,
    private readonly acesso: AcessoProfissionalService,
  ) {}

  @Cron('0 2 * * *', { name: 'acesso-profissional', timeZone: 'America/Sao_Paulo' })
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
  async rodar(agora: Date): Promise<number> {
    try {
      const encerrados = await this.cls.run(() => this.acesso.avaliarTodos(agora));
      this.logger.log({ encerrados }, 'Acesso dos profissionais reavaliado');
      return encerrados;
    } catch (erro) {
      // Só o tipo do erro: a mensagem pode trazer valores (dados pessoais).
      this.logger.error(
        { erro: erro instanceof Error ? erro.name : 'Erro' },
        'Falha ao reavaliar o acesso dos profissionais',
      );
      return 0;
    }
  }
}
