import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  descreverValorContrato,
  type ConfirmarSemCobrancaInput,
  type ContratoSala as ContratoSalaDto,
  type GerarCobrancasMesResumo,
  type GerarParcelaContratoInput,
} from '@torres/shared';
import { AuditService } from '../../../common/audit/audit.service';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import { BusinessException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ContasReceberService } from '../../financeiro/contas-receber/contas-receber.service';
import { competenciaAtual, dataVencimentoDoMes, limitesCompetencia } from './competencia-cobranca';
import { ContratosSalaService } from './contratos-sala.service';

/**
 * Cobranças dos contratos de sala (issue #115): "Gerar Cobranças do Mês" (Mensal, automático),
 * "Gerar parcela de mês/ano" (manual, quando não há valor calculável) e "Confirmar sem
 * cobrança". A idempotência é por `ContratoSalaCobranca` (uma linha por contrato e mês).
 */
@Injectable()
export class ContratosSalaCobrancaService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly contratos: ContratosSalaService,
    private readonly contasReceber: ContasReceberService,
    private readonly audit: AuditService,
    private readonly escopo: EscopoDadosService,
  ) {}

  /**
   * Gera uma conta a receber por contrato Mensal ativo (sem permuta) no mês atual, sem
   * duplicar. Contratos Por Turno ficam como "sem valor calculável" (não há regra automática
   * para calcular o uso do mês); Hora Avulsa é gerada pelo modal "Horas Utilizadas".
   */
  @Transactional()
  async gerarCobrancasDoMes(): Promise<GerarCobrancasMesResumo> {
    // Rotina de todos os contratos: não é para usuário restrito a profissionais (issue #153).
    if (this.escopo.restrito()) throw semPermissao();
    const competencia = competenciaAtual();
    const { de, ate } = limitesCompetencia(competencia);
    const contratos = (await this.contratos.ativosNoPeriodo(de, ate)).filter((c) => !c.permuta);

    let geradas = 0;
    let jaExistentes = 0;
    const semValorCalculavel: GerarCobrancasMesResumo['semValorCalculavel'] = [];

    for (const contrato of contratos) {
      const existente = await this.buscarCobranca(contrato.id, competencia);
      if (existente) {
        jaExistentes++;
        continue;
      }
      if (contrato.modalidade !== 'MENSAL') {
        semValorCalculavel.push({
          contratoId: contrato.id,
          salaNome: contrato.salaNome,
          locatarioNome: contrato.locatarioNome,
        });
        continue;
      }
      await this.gerarEregistrar(contrato, competencia, {
        valor: contrato.valorUnitario,
        dataVencimento: dataVencimentoDoMes(competencia, contrato.diaVencimento),
      });
      geradas++;
    }
    return { competencia, geradas, jaExistentes, semValorCalculavel };
  }

  /** Gera a parcela manualmente (linha "Contrato sem cobrança"), informando valor e vencimento. */
  @Transactional()
  async gerarParcela(
    contratoId: string,
    input: GerarParcelaContratoInput,
  ): Promise<ContratoSalaDto> {
    const contrato = await this.contratoAtivo(contratoId);
    await this.garantirSemCobranca(contratoId, input.competencia);
    await this.gerarEregistrar(contrato, input.competencia, {
      valor: input.valor,
      dataVencimento: input.dataVencimento,
    });
    return contrato;
  }

  /** Confirma que o contrato não terá cobrança no mês informado, parando o aviso na tela. */
  @Transactional()
  async confirmarSemCobranca(contratoId: string, input: ConfirmarSemCobrancaInput): Promise<void> {
    await this.contratoAtivo(contratoId);
    await this.garantirSemCobranca(contratoId, input.competencia);
    const confirmacao = await this.txHost.tx.contratoSalaCobranca.create({
      data: { contratoSalaId: contratoId, competencia: input.competencia, contaReceberId: null },
    });
    await this.audit.record({
      action: 'CREATE',
      entity: 'ContratoSalaCobranca',
      entityId: confirmacao.id,
      before: null,
      after: confirmacao,
    });
  }

  private async gerarEregistrar(
    contrato: ContratoSalaDto,
    competencia: string,
    valores: { valor: number; dataVencimento: string },
  ): Promise<void> {
    const conta = await this.contasReceber.criarDeOrigemExterna({
      descricao: `Aluguel de sala - ${contrato.salaNome} - ${contrato.locatarioNome} (${descreverValorContrato(contrato)})`,
      pacienteId: contrato.locatarioTipo === 'CLIENTE' ? contrato.locatarioId : null,
      valor: valores.valor,
      dataVencimento: valores.dataVencimento,
      formaPagamentoId: contrato.formaPagamentoId,
      planoContaId: null,
      documento: null,
      totalParcelas: 1,
      status: 'PENDENTE',
      observacoes: null,
    });
    await this.txHost.tx.contratoSalaCobranca.create({
      data: { contratoSalaId: contrato.id, competencia, contaReceberId: conta.id },
    });
  }

  private async buscarCobranca(contratoSalaId: string, competencia: string) {
    return this.txHost.tx.contratoSalaCobranca.findUnique({
      where: { contratoSalaId_competencia: { contratoSalaId, competencia } },
    });
  }

  /**
   * Ids das contas a receber geradas por cobrança de contrato (receita recorrente) nas
   * competências `AAAA-MM` de `de` a `ate`. Usado pelos Indicadores do Financeiro.
   */
  async idsContasReceberDasCobrancas(de: string, ate: string): Promise<string[]> {
    const linhas = await this.txHost.tx.contratoSalaCobranca.findMany({
      where: { competencia: { gte: de, lte: ate }, contaReceberId: { not: null } },
      select: { contaReceberId: true },
    });
    return linhas.flatMap((l) => (l.contaReceberId ? [l.contaReceberId] : []));
  }

  private async garantirSemCobranca(contratoSalaId: string, competencia: string): Promise<void> {
    if (await this.buscarCobranca(contratoSalaId, competencia)) {
      throw new BusinessException(
        'CONTRATO_JA_TEM_COBRANCA',
        'Este contrato já tem cobrança (ou confirmação de sem cobrança) nesse mês.',
        { status: 409 },
      );
    }
  }

  private async contratoAtivo(id: string): Promise<ContratoSalaDto> {
    const contrato = await this.contratos.findById(id);
    if (contrato.status !== 'ATIVO') {
      throw new BusinessException(
        'CONTRATO_NAO_ATIVO',
        'Só é possível gerar cobrança de um contrato ativo.',
        { status: 409 },
      );
    }
    return contrato;
  }
}
