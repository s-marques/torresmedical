import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  PESQUISA_PROFISSIONAL_DIAS_PRIMEIRA,
  PESQUISA_PROFISSIONAL_VALIDADE_DIAS,
  aplicarVariaveisPesquisaProfissional,
  type PesquisaProfissionalConfig,
} from '@torres/shared';
import { AuditService } from '../../../common/audit/audit.service';
import { gerarSegredo, hashToken } from '../../../common/auth/tokens';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { CanaisWhatsappService } from '../../configuracoes-gestao/canais-whatsapp/canais-whatsapp.service';
import type { AgoraClinica } from '../campanhas/relogio-clinica';
import { paraColunaData } from '../campanhas/relogio-clinica';
import { somarDias } from '../confirmacoes/envio-confirmacao.service';
import { MensagensSaidaWhatsappService } from '../whatsapp/mensagens-saida-whatsapp.service';
import { cicloDevido } from './ciclo-pesquisa-profissional';
import { PesquisaProfissionalConfigService } from './pesquisa-profissional-config.service';

/** Endereço do front, para montar o link de resposta. */
export function urlBaseWeb(env: NodeJS.ProcessEnv = process.env): string {
  return (env.WEB_BASE_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
}

export function linkDaPesquisa(token: string, base = urlBaseWeb()): string {
  return `${base}/pesquisa-profissional/responder?token=${encodeURIComponent(token)}`;
}

/**
 * Envia a pesquisa de experiência aos profissionais com contrato de sala ativo: a primeira aos 30
 * dias do início do contrato e as seguintes na periodicidade configurada. Uma pesquisa por
 * `(profissional, ciclo)`: rodar de novo não manda a mensagem outra vez. Falha de canal ou de
 * telefone não lança: a pesquisa fica `FALHA` e é tentada de novo na próxima rodada.
 */
@Injectable()
export class EnvioPesquisaProfissionalService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly config: PesquisaProfissionalConfigService,
    private readonly canais: CanaisWhatsappService,
    private readonly whatsapp: MensagensSaidaWhatsappService,
    private readonly audit: AuditService,
  ) {}

  /** Uma rodada. Devolve quantas pesquisas foram criadas ou reenviadas. */
  async dispararDevidos(agora: AgoraClinica): Promise<number> {
    const config = await this.config.configuracao();
    if (!config.ativo) return 0;
    const tx = this.txHost.tx;
    // Só vale a pena olhar contratos que já têm 30 dias de início.
    const limite = paraColunaData(somarDias(agora.dia, -PESQUISA_PROFISSIONAL_DIAS_PRIMEIRA));
    const inicios = await tx.contratoSala.groupBy({
      by: ['profissionalId'],
      where: {
        status: 'ATIVO',
        deletedAt: null,
        profissionalId: { not: null },
        dataInicio: { lte: limite },
        profissional: { ativo: true, deletedAt: null },
      },
      _min: { dataInicio: true },
    });

    let total = 0;
    for (const { profissionalId, _min } of inicios) {
      if (!profissionalId || !_min.dataInicio) continue;
      const ciclo = cicloDevido(
        _min.dataInicio.toISOString().slice(0, 10),
        agora.dia,
        config.periodicidadeMeses,
      );
      if (ciclo === null) continue;
      if (await this.enviar(profissionalId, ciclo, config)) total++;
    }
    return total;
  }

  /** `true` quando criou ou reenviou a pesquisa do ciclo. */
  private async enviar(
    profissionalId: string,
    ciclo: number,
    config: PesquisaProfissionalConfig,
  ): Promise<boolean> {
    const tx = this.txHost.tx;
    const ultima = await tx.pesquisaProfissional.findFirst({
      where: { profissionalId },
      orderBy: { ciclo: 'desc' },
    });
    // Já mandou este ciclo (ou um posterior) e não falhou: nada a fazer.
    if (ultima && (ultima.ciclo > ciclo || (ultima.ciclo === ciclo && ultima.status !== 'FALHA'))) {
      return false;
    }
    const profissional = await tx.profissional.findFirst({
      where: { id: profissionalId, ativo: true, deletedAt: null },
    });
    if (!profissional) return false;

    const token = gerarSegredo();
    let erro: string | null = null;
    let mensagemId: string | null = null;
    const canalId = await this.canais.canalParaProfissional(profissionalId);
    if (!profissional.telefone?.trim()) erro = 'SEM_TELEFONE';
    else if (!canalId) erro = 'SEM_CANAL';
    else {
      mensagemId = await this.whatsapp.registrar({
        canalId,
        nome: profissional.nome,
        telefone: profissional.telefone,
        conteudo: aplicarVariaveisPesquisaProfissional(config.mensagem, {
          nome: profissional.nome,
          link: linkDaPesquisa(token),
        }),
      });
    }

    const agora = new Date();
    const dados = {
      status: erro ? ('FALHA' as const) : ('ENVIADA' as const),
      erro,
      tokenHash: hashToken(token),
      expiraEm: new Date(agora.getTime() + PESQUISA_PROFISSIONAL_VALIDADE_DIAS * 86_400_000),
      mensagemWhatsappId: mensagemId,
      enviadaEm: agora,
    };
    // Ciclo que falhou antes: reaproveita a linha (o par profissional + ciclo é único).
    const reenvio = ultima?.ciclo === ciclo ? ultima : null;
    const pesquisa = reenvio
      ? await tx.pesquisaProfissional.update({ where: { id: reenvio.id }, data: dados })
      : await tx.pesquisaProfissional.create({
          data: {
            profissionalId,
            ciclo,
            tipo: ciclo === 0 ? 'TRINTA_DIAS' : 'PERIODICA',
            ...dados,
          },
        });
    // Falha repetida não gera registro novo a cada rodada.
    if (!reenvio || !erro) {
      await this.audit.record({
        action: reenvio ? 'UPDATE' : 'CREATE',
        entity: 'PesquisaProfissional',
        entityId: pesquisa.id,
        before: reenvio ? { status: reenvio.status, erro: reenvio.erro } : null,
        after: { profissionalId, ciclo, status: pesquisa.status, erro },
      });
    }
    return true;
  }
}
