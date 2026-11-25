import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  CONTA_PAGAR_POSSIVEL_DUPLICADA,
  type ContaPagarDuplicidadeMotivo,
  type ContaPagarPossivelDuplicada,
  type VerificacaoDuplicidadeContaPagar,
  type VerificarDuplicidadeContaPagar,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { BusinessException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { FornecedoresService } from '../../compras-estoque/fornecedores/fornecedores.service';
import { FuncionariosService } from '../../regulatorio-qualidade/funcionarios/funcionarios.service';
import { nomeBeneficiario } from './nome-beneficiario';

export const ENTIDADE_DUPLICIDADE = 'ContaPagarDuplicidade';
const LIMITE_CANDIDATOS = 20;

/** Dados que identificam o título, já normalizados para comparar. */
export type FonteDuplicidade = Partial<
  Pick<
    VerificarDuplicidadeContaPagar,
    'beneficiarioTipo' | 'beneficiarioId' | 'valor' | 'dataVencimento' | 'documento'
  >
>;

const normalizar = (documento: string | null | undefined): string | null =>
  documento?.trim().toLowerCase() || null;

/**
 * Possível lançamento duplicado de conta a pagar (issue #163; requisito do cliente, seção 16 do
 * "Rastreio de dificuldades do DrIntelli"): mesmo fornecedor + valor + vencimento, ou mesmo
 * número de documento. É só um alerta: o usuário confirma para gravar mesmo assim.
 */
@Injectable()
export class ContasPagarDuplicidadeService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly audit: AuditService,
    private readonly fornecedores: FornecedoresService,
    private readonly funcionarios: FuncionariosService,
  ) {}

  /** `POST /contas-pagar/duplicidade`: a mesma regra que `create`/`update` aplicam ao gravar. */
  async verificar(
    input: VerificarDuplicidadeContaPagar,
  ): Promise<VerificacaoDuplicidadeContaPagar> {
    return { candidatos: await this.candidatos(input, input.contaPagarId ?? undefined) };
  }

  /**
   * Garante que o usuário viu o alerta: sem `confirmado`, uma possível duplicidade vira 409.
   * Devolve os candidatos (vazio quando não há) para `registrarConfirmacao` depois de gravar.
   */
  async exigirConfirmacao(
    input: FonteDuplicidade,
    confirmado: boolean | undefined,
    contaPagarId?: string,
  ): Promise<ContaPagarPossivelDuplicada[]> {
    const candidatos = await this.candidatos(input, contaPagarId);
    if (candidatos.length > 0 && !confirmado) {
      throw new BusinessException(
        CONTA_PAGAR_POSSIVEL_DUPLICADA,
        'Conta possivelmente já lançada. Confira os títulos parecidos antes de continuar.',
        { status: 409 },
      );
    }
    return candidatos;
  }

  /** Quem escolheu continuar e sobre quais títulos (o usuário vem do contexto da requisição). */
  async registrarConfirmacao(
    contaPagarId: string,
    candidatos: readonly ContaPagarPossivelDuplicada[],
  ): Promise<void> {
    if (candidatos.length === 0) return;
    await this.audit.record({
      action: 'CREATE',
      entity: ENTIDADE_DUPLICIDADE,
      entityId: contaPagarId,
      after: {
        duplicidadeConfirmada: true,
        possiveisDuplicadas: candidatos.map(({ id, motivos }) => ({ id, motivos })),
      },
    });
  }

  private async candidatos(
    input: FonteDuplicidade,
    contaPagarId?: string,
  ): Promise<ContaPagarPossivelDuplicada[]> {
    const fonte = await this.somenteAlterados(input, contaPagarId);
    const criterios = this.criterios(fonte);
    if (criterios.length === 0) return [];

    const linhas = await this.txHost.tx.contaPagar.findMany({
      where: {
        deletedAt: null,
        status: { not: 'CANCELADO' },
        AND: [{ OR: criterios }, ...(contaPagarId ? [{ id: { not: contaPagarId } }] : [])],
      },
      orderBy: [{ dataVencimento: 'desc' }, { numero: 'desc' }],
      take: LIMITE_CANDIDATOS,
    });

    const lista: ContaPagarPossivelDuplicada[] = [];
    for (const linha of linhas) {
      const beneficiarioId = linha.fornecedorId ?? linha.funcionarioId;
      lista.push({
        id: linha.id,
        numero: linha.numero,
        descricao: linha.descricao,
        beneficiarioNome: await nomeBeneficiario(
          this.fornecedores,
          this.funcionarios,
          linha.beneficiarioTipo,
          beneficiarioId,
        ),
        valor: linha.valor.toString(),
        dataVencimento: linha.dataVencimento.toISOString().slice(0, 10),
        documento: linha.documento,
        status: linha.status,
        motivos: this.motivos(fonte, linha),
      });
    }
    return lista.filter((c) => c.motivos.length > 0);
  }

  /**
   * Na edição só conta o que mudou: quem já tem um título parecido não precisa confirmar de novo
   * a cada alteração de outros campos.
   */
  private async somenteAlterados(
    input: FonteDuplicidade,
    contaPagarId?: string,
  ): Promise<FonteDuplicidade> {
    if (!contaPagarId) return input;
    const atual = await this.txHost.tx.contaPagar.findFirst({
      where: { id: contaPagarId, deletedAt: null },
    });
    if (!atual) return input;
    const beneficiarioAtual = atual.fornecedorId ?? atual.funcionarioId;
    const mesmoTitulo =
      input.beneficiarioTipo === atual.beneficiarioTipo &&
      (input.beneficiarioId ?? null) === beneficiarioAtual &&
      (input.valor === undefined || input.valor === null
        ? false
        : atual.valor.equals(input.valor)) &&
      (input.dataVencimento ?? null) === atual.dataVencimento.toISOString().slice(0, 10);
    const mesmoDocumento = normalizar(input.documento) === normalizar(atual.documento);
    return {
      ...input,
      ...(mesmoTitulo && { beneficiarioId: null, valor: null, dataVencimento: null }),
      ...(mesmoDocumento && { documento: null }),
    };
  }

  private criterios(fonte: FonteDuplicidade): Prisma.ContaPagarWhereInput[] {
    const criterios: Prisma.ContaPagarWhereInput[] = [];
    if (fonte.beneficiarioId && fonte.valor && fonte.dataVencimento) {
      criterios.push({
        beneficiarioTipo: fonte.beneficiarioTipo ?? 'FORNECEDOR',
        ...(fonte.beneficiarioTipo === 'FUNCIONARIO'
          ? { funcionarioId: fonte.beneficiarioId }
          : { fornecedorId: fonte.beneficiarioId }),
        valor: fonte.valor,
        dataVencimento: new Date(fonte.dataVencimento),
      });
    }
    const documento = normalizar(fonte.documento);
    if (documento) criterios.push({ documento: { equals: documento, mode: 'insensitive' } });
    return criterios;
  }

  private motivos(
    fonte: FonteDuplicidade,
    linha: {
      beneficiarioTipo: string;
      fornecedorId: string | null;
      funcionarioId: string | null;
      valor: { equals(valor: number): boolean };
      dataVencimento: Date;
      documento: string | null;
    },
  ): ContaPagarDuplicidadeMotivo[] {
    const motivos: ContaPagarDuplicidadeMotivo[] = [];
    const beneficiarioLinha = linha.fornecedorId ?? linha.funcionarioId;
    if (
      fonte.beneficiarioId &&
      fonte.valor &&
      fonte.dataVencimento &&
      fonte.beneficiarioId === beneficiarioLinha &&
      (fonte.beneficiarioTipo ?? 'FORNECEDOR') === linha.beneficiarioTipo &&
      linha.valor.equals(fonte.valor) &&
      linha.dataVencimento.toISOString().slice(0, 10) === fonte.dataVencimento
    ) {
      motivos.push('MESMO_TITULO');
    }
    const documento = normalizar(fonte.documento);
    if (documento && documento === normalizar(linha.documento)) motivos.push('MESMO_DOCUMENTO');
    return motivos;
  }
}
