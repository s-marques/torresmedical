import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/**
 * Pacientes vinculados aos profissionais do escopo do usuário (issue #153): os que têm ao menos
 * um atendimento com um deles (definição confirmada pelo dev). Este módulo é o dono de
 * `Atendimento`; os outros módulos (tela Pacientes) usam este service exportado.
 */
@Injectable()
export class PacientesVinculadosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly escopo: EscopoDadosService,
  ) {}

  /** Ids dos pacientes visíveis; `null` = todos (usuário sem restrição). */
  async idsNoEscopo(): Promise<string[] | null> {
    const profissionalIds = this.escopo.profissionalIds();
    if (profissionalIds === null) return null;
    if (profissionalIds.length === 0) return [];
    const grupos = await this.txHost.tx.atendimento.groupBy({
      by: ['pacienteId'],
      where: { profissionalId: { in: [...profissionalIds] }, deletedAt: null },
    });
    return grupos.map((g) => g.pacienteId);
  }

  /** O paciente está no escopo? Sem restrição, sempre. */
  async permite(pacienteId: string): Promise<boolean> {
    const profissionalIds = this.escopo.profissionalIds();
    if (profissionalIds === null) return true;
    if (profissionalIds.length === 0) return false;
    const atendimentos = await this.txHost.tx.atendimento.count({
      where: { pacienteId, profissionalId: { in: [...profissionalIds] }, deletedAt: null },
    });
    return atendimentos > 0;
  }

  /** 403 quando o paciente não tem atendimento com um profissional do escopo. */
  async garantir(pacienteId: string): Promise<void> {
    if (!(await this.permite(pacienteId))) throw semPermissao();
  }
}
