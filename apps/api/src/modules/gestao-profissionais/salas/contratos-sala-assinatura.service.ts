import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { AssinarContratoSalaInput, ContratoSala as ContratoSalaDto } from '@torres/shared';
import { BusinessException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ArquivosService } from '../../../common/storage/arquivos.service';
import { ProfissionaisOnboardingService } from '../profissionais/profissionais-onboarding.service';
import { competenciaAtual, dataVencimentoDoMes } from './competencia-cobranca';
import { ContratosSalaCobrancaService } from './contratos-sala-cobranca.service';
import { ContratosSalaService } from './contratos-sala.service';
import { hojeEmSaoPaulo } from './data-local';

const paraData = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Assinatura do contrato de sala (issue #142): é só o registro da data e do PDF assinado, sem
 * assinatura eletrônica. Ao assinar, o contrato passa a ativo, o profissional ganha o checklist de
 * onboarding e a cobrança do primeiro mês é gerada (#115) quando o contrato é Mensal e tem valor.
 * Roda dentro da transação do @Audit do endpoint. O horário de atendimento e o usuário são só sugeridos (`GET .../onboarding`): o dev confirma.
 */
@Injectable()
export class ContratosSalaAssinaturaService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly contratos: ContratosSalaService,
    private readonly cobrancas: ContratosSalaCobrancaService,
    private readonly onboarding: ProfissionaisOnboardingService,
    private readonly arquivos: ArquivosService,
  ) {}

  async assinar(
    id: string,
    input: AssinarContratoSalaInput,
    agora = new Date(),
  ): Promise<ContratoSalaDto> {
    const contrato = await this.contratos.findById(id);
    if (contrato.status !== 'AGUARDANDO_ASSINATURA') {
      throw new BusinessException(
        'CONTRATO_NAO_AGUARDA_ASSINATURA',
        'Só é possível assinar um contrato que está aguardando assinatura.',
        { status: 409 },
      );
    }
    if (input.assinadoEm > hojeEmSaoPaulo(agora)) {
      throw new BusinessException('CONTRATO_INVALIDO', 'A data de assinatura não pode ser futura', {
        status: 400,
        details: [{ field: 'assinadoEm', message: 'A data de assinatura não pode ser futura' }],
      });
    }
    if (input.pdfArquivoId) await this.garantirPdf(input.pdfArquivoId);

    await this.txHost.tx.contratoSala.update({
      where: { id },
      data: {
        status: 'ATIVO',
        assinadoEm: paraData(input.assinadoEm),
        ...(input.pdfArquivoId ? { pdfArquivoId: input.pdfArquivoId } : {}),
      },
    });
    await this.onboarding.iniciar(contrato.locatarioId, id, paraData(input.assinadoEm));
    const ativo = await this.contratos.findById(id);
    await this.gerarPrimeiraCobranca(ativo, agora);
    return this.contratos.findById(id);
  }

  /**
   * Cobrança do mês da vigência (o atual, ou o do início se o contrato começa depois): só
   * Mensal, sem permuta e com valor. Os demais seguem pelos fluxos da #115.
   */
  private async gerarPrimeiraCobranca(contrato: ContratoSalaDto, agora: Date): Promise<void> {
    if (contrato.modalidade !== 'MENSAL' || contrato.permuta || contrato.valorUnitario <= 0) return;
    const inicio = contrato.dataInicio.slice(0, 7);
    const atual = competenciaAtual(agora);
    const competencia = inicio > atual ? inicio : atual;
    await this.cobrancas.gerarParcela(contrato.id, {
      competencia,
      valor: contrato.valorUnitario,
      dataVencimento: dataVencimentoDoMes(competencia, contrato.diaVencimento),
    });
  }

  private async garantirPdf(arquivoId: string): Promise<void> {
    const arquivo = await this.arquivos.findById(arquivoId);
    if (arquivo.uso !== 'contrato-sala') {
      throw new BusinessException('ARQUIVO_USO_INVALIDO', 'Arquivo inválido para este campo', {
        status: 400,
        details: [{ field: 'pdfArquivoId', message: 'O arquivo enviado não é do tipo esperado' }],
      });
    }
  }
}
