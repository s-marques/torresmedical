import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { ProntuarioAcessoRecurso } from '@torres/shared';
import type { Atendimento as AtendimentoModel } from '../../../generated/prisma/client';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import { PacientesVinculadosService } from '../pacientes-vinculados/pacientes-vinculados.service';
import { AcessoProntuarioService } from './acesso-prontuario.service';

/** Atendimento assinado não é editado, nem perde exame ou documento: a correção é um adendo. */
export function atendimentoAssinado(): BusinessException {
  return new BusinessException(
    'ATENDIMENTO_ASSINADO',
    'Atendimento assinado não pode ser alterado. Registre um adendo.',
    { status: 409 },
  );
}

/**
 * Porta de entrada dos recursos do atendimento (exames, anexos, documentos, assinatura e
 * versões): confere paciente, vínculo do paciente e profissional responsável do atendimento no
 * escopo do usuário (issue #153). Fora do escopo a resposta é 403, como no restante do prontuário.
 */
@Injectable()
export class AtendimentoAcessoService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly pacientes: PacientesService,
    private readonly vinculados: PacientesVinculadosService,
    private readonly escopo: EscopoDadosService,
    private readonly acessos: AcessoProntuarioService,
  ) {}

  /**
   * Atendimento do paciente, existente (404) e do escopo do usuário (403). Com `recurso`, grava o
   * acesso de leitura no log do prontuário (só depois de o escopo liberar).
   */
  async carregar(
    pacienteId: string,
    atendimentoId: string,
    recurso?: ProntuarioAcessoRecurso,
  ): Promise<AtendimentoModel> {
    await this.pacientes.detalhe(pacienteId);
    await this.vinculados.garantir(pacienteId);
    const atendimento = isUuid(atendimentoId)
      ? await this.txHost.tx.atendimento.findFirst({
          where: { id: atendimentoId, pacienteId, deletedAt: null },
        })
      : null;
    if (!atendimento) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Atendimento não encontrado', {
        status: 404,
      });
    }
    this.escopo.garantirProfissional(atendimento.profissionalId);
    if (recurso) await this.acessos.registrar(pacienteId, recurso);
    return atendimento;
  }
}
