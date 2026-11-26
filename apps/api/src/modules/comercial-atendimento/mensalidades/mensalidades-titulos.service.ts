import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  descricaoTituloMensalidade,
  mensalidadeVigenteNaCompetencia,
  vencimentoTituloMensalidade,
  type GerarTitulosMensalidadesResumo,
  type Mensalidade,
} from '@torres/shared';
import { AuditService } from '../../../common/audit/audit.service';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ContasReceberService } from '../../financeiro/contas-receber/contas-receber.service';
import { MensalidadesService } from './mensalidades.service';

/**
 * "Gerar Titulos do Mes" (issue #6, print do dev): uma conta a receber por mensalidade ativa e
 * vigente no mês escolhido, sem duplicar. A idempotência é por `MensalidadeTitulo` (uma linha por
 * mensalidade e mês). Pausadas e canceladas ficam de fora.
 */
@Injectable()
export class MensalidadesTitulosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly mensalidades: MensalidadesService,
    private readonly contasReceber: ContasReceberService,
    private readonly audit: AuditService,
    private readonly escopo: EscopoDadosService,
  ) {}

  /** Cobrança em lote de todos os pacientes: só para quem não tem escopo restrito (issue #153). */
  @Transactional()
  async gerar(competencia: string): Promise<GerarTitulosMensalidadesResumo> {
    if (this.escopo.restrito()) throw semPermissao();
    const vigentes = (await this.mensalidades.ativas()).filter((m) =>
      mensalidadeVigenteNaCompetencia(m, competencia),
    );
    const jaGeradas = await this.mensalidadesComTitulo(
      vigentes.map((m) => m.id),
      competencia,
    );

    let geradas = 0;
    for (const mensalidade of vigentes) {
      if (jaGeradas.has(mensalidade.id)) continue;
      await this.gerarTitulo(mensalidade, competencia);
      geradas++;
    }
    return { competencia, geradas, jaExistentes: jaGeradas.size };
  }

  private async mensalidadesComTitulo(ids: string[], competencia: string): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const titulos = await this.txHost.tx.mensalidadeTitulo.findMany({
      where: { mensalidadeId: { in: ids }, competencia },
      select: { mensalidadeId: true },
    });
    return new Set(titulos.map((t) => t.mensalidadeId));
  }

  private async gerarTitulo(mensalidade: Mensalidade, competencia: string): Promise<void> {
    const conta = await this.contasReceber.criarDeOrigemExterna({
      descricao: descricaoTituloMensalidade(mensalidade.descricao),
      pacienteId: mensalidade.pacienteId,
      competencia,
      valor: Number(mensalidade.valor),
      dataVencimento: vencimentoTituloMensalidade(competencia, mensalidade.diaVencimento),
      formaPagamentoId: mensalidade.formaPagamentoId,
      planoContaId: null,
      documento: null,
      totalParcelas: 1,
      status: 'PENDENTE',
      observacoes: null,
    });
    const titulo = await this.txHost.tx.mensalidadeTitulo.create({
      data: { mensalidadeId: mensalidade.id, competencia, contaReceberId: conta.id },
    });
    await this.audit.record({
      action: 'CREATE',
      entity: 'MensalidadeTitulo',
      entityId: titulo.id,
      before: null,
      after: titulo,
    });
  }
}
