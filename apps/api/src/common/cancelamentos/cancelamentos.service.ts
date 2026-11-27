import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  MOTIVO_CODIGO_CONTRATO_CANCELADO,
  mensagemObrigatoria,
  type Cancelamento as CancelamentoDto,
  type EntidadeCancelamento,
  type MotivoOpcao,
  type TipoCancelamento,
} from '@torres/shared';
import type { Cancelamento } from '../../generated/prisma/client';
import { RequestContextService } from '../context/request-context.service';
import { BusinessException, ValidationException } from '../errors/api.exception';
import type { PrismaAdapter } from '../prisma/prisma-transaction';

export interface RegistrarCancelamentoInput {
  tipo: TipoCancelamento;
  entidade: EntidadeCancelamento;
  entidadeId: string;
  motivoId: string;
  observacao?: string | null;
  /** Profissional da consulta, do contrato ou do período; alimenta o relatório por profissional. */
  profissionalId?: string | null;
  /** Só na consulta: o novo agendamento que ocupou o lugar do cancelado. */
  reagendouParaId?: string | null;
}

function toDto(c: Cancelamento): CancelamentoDto {
  return {
    id: c.id,
    tipo: c.tipo,
    entidade: c.entidade,
    entidadeId: c.entidadeId,
    motivo: c.motivoNome,
    observacao: c.observacao,
    canceladoPorId: c.canceladoPorId,
    canceladoEm: c.canceladoEm.toISOString(),
    reagendouParaId: c.reagendouParaId,
  };
}

function motivoInvalido(): ValidationException {
  return new ValidationException([{ field: 'motivoId', message: 'Motivo inválido' }]);
}

/**
 * Registro dos cancelamentos (issue #162, R §34 e §35). Cada módulo cancela a sua entidade
 * (status, regras) e chama `registrar` na mesma transação: o histórico guarda quem, quando, o
 * motivo da lista do tipo, a observação e, na consulta, o reagendamento. Nada é apagado.
 */
@Injectable()
export class CancelamentosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly contexto: RequestContextService,
  ) {}

  /** Motivos ativos do tipo, na ordem da lista (para o modal de cancelamento). */
  async motivosDoTipo(tipo: TipoCancelamento): Promise<MotivoOpcao[]> {
    const motivos = await this.txHost.tx.motivoCancelamento.findMany({
      where: { tipo, ativo: true, deletedAt: null },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    });
    return motivos.map((m) => ({ id: m.id, nome: m.nome, exigeTexto: m.exigeTexto }));
  }

  /**
   * Grava o cancelamento. O motivo precisa existir, estar ativo e ser do tipo; o motivo que
   * exige texto ("Outro") exige a observação. O usuário vem do contexto da requisição.
   */
  async registrar(input: RegistrarCancelamentoInput): Promise<CancelamentoDto> {
    const motivo = await this.txHost.tx.motivoCancelamento.findFirst({
      where: { id: input.motivoId, tipo: input.tipo, ativo: true, deletedAt: null },
    });
    if (!motivo) throw motivoInvalido();

    const observacao = input.observacao?.trim() || null;
    if (motivo.exigeTexto && !observacao) {
      throw new ValidationException([
        { field: 'observacao', message: mensagemObrigatoria('Observação', 'f') },
      ]);
    }
    if (input.reagendouParaId && input.tipo !== 'CONSULTA') {
      throw new ValidationException([
        { field: 'reagendouParaId', message: 'Só a consulta pode ter reagendamento' },
      ]);
    }
    return this.gravar(input, motivo.id, motivo.nome, observacao);
  }

  /**
   * Cancelamento feito pelo sistema como consequência de outro (ex.: as parcelas pendentes de um
   * contrato cancelado), com o motivo de sistema pelo código.
   */
  async registrarContratoCancelado(
    entidade: EntidadeCancelamento,
    entidadeId: string,
    observacao?: string | null,
  ): Promise<CancelamentoDto> {
    const motivo = await this.txHost.tx.motivoCancelamento.findFirst({
      where: { tipo: 'COBRANCA', codigo: MOTIVO_CODIGO_CONTRATO_CANCELADO, deletedAt: null },
    });
    if (!motivo) {
      throw new BusinessException(
        'MOTIVO_CANCELAMENTO_AUSENTE',
        'O motivo "Contrato encerrado ou cancelado" não está cadastrado.',
      );
    }
    return this.gravar(
      { tipo: 'COBRANCA', entidade, entidadeId },
      motivo.id,
      motivo.nome,
      observacao?.trim() || null,
    );
  }

  /**
   * Negócio perdido: o motivo vem da lista própria do Pipeline (`MotivoPerda`), então o histórico
   * guarda só o nome (tipo `PROPOSTA`, sem `motivo_id`).
   */
  registrarNegocioPerdido(
    negocioId: string,
    motivoNome: string,
    profissionalId?: string | null,
  ): Promise<CancelamentoDto> {
    return this.gravar(
      { tipo: 'PROPOSTA', entidade: 'Negocio', entidadeId: negocioId, profissionalId },
      null,
      motivoNome,
      null,
    );
  }

  private async gravar(
    input: Omit<RegistrarCancelamentoInput, 'motivoId'>,
    motivoId: string | null,
    motivoNome: string,
    observacao: string | null,
  ): Promise<CancelamentoDto> {
    const criado = await this.txHost.tx.cancelamento.create({
      data: {
        tipo: input.tipo,
        entidade: input.entidade,
        entidadeId: input.entidadeId,
        motivoId,
        motivoNome,
        observacao,
        canceladoPorId: this.contexto.getUserId() ?? null,
        profissionalId: input.profissionalId ?? null,
        reagendouParaId: input.reagendouParaId ?? null,
      },
    });
    return toDto(criado);
  }
}
