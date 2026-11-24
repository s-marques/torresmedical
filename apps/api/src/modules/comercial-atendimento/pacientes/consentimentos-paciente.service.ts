import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  CONSENTIMENTO_VERSAO_ATUAL,
  type Consentimento,
  type ConsentimentosResponse,
  type ConsentimentoTipo,
  type CreateConsentimentoInput,
} from '@torres/shared';
import { AuditService } from '../../../common/audit/audit.service';
import { isUuid } from '../../../common/auth/tokens';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ConsentimentoPaciente } from '../../../generated/prisma/client';
import { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import { PacientesVinculadosService } from '../../consultorio-assistencial/pacientes-vinculados/pacientes-vinculados.service';

const ENTIDADE_AUDITORIA = 'ConsentimentoPaciente';

function toConsentimentoDto(
  c: ConsentimentoPaciente,
  nomes: ReadonlyMap<string, string>,
): Consentimento {
  return {
    id: c.id,
    pacienteId: c.pacienteId,
    tipo: c.tipo,
    aceito: c.aceito,
    canal: c.canal,
    versao: c.versao,
    observacao: c.observacao,
    registradoPorId: c.registradoPorId,
    registradoPorNome: c.registradoPorId ? (nomes.get(c.registradoPorId) ?? null) : null,
    registradoEm: c.registradoEm.toISOString(),
  };
}

/**
 * Consentimentos LGPD do paciente (issue #148). O histórico só cresce: revogar grava um novo
 * registro `aceito = false`. O vigente de cada tipo é o mais recente, e este service é o único que
 * grava os espelhos no cadastro (`aceitaCampanhasWhatsapp` e `aceitaComunicacao`), que as
 * campanhas, confirmações e pesquisas usam para decidir se enviam.
 *
 * Sem nenhum registro de um tipo, vale o padrão do cadastro (pode receber).
 */
@Injectable()
export class ConsentimentosPacienteService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly usuarios: UsuariosLookupService,
    private readonly contexto: RequestContextService,
    private readonly vinculados: PacientesVinculadosService,
    private readonly audit: AuditService,
  ) {}

  /** Histórico do paciente, do mais recente para o mais antigo. Respeita o escopo do usuário. */
  async listar(pacienteId: string): Promise<ConsentimentosResponse> {
    await this.garantirPaciente(pacienteId);
    await this.vinculados.garantir(pacienteId);
    const registros = await this.txHost.tx.consentimentoPaciente.findMany({
      where: { pacienteId },
      orderBy: [{ registradoEm: 'desc' }, { id: 'desc' }],
    });
    const nomes = await this.usuarios.nomesPorIds(
      registros.flatMap((r) =>
        r.registradoPorId && isUuid(r.registradoPorId) ? [r.registradoPorId] : [],
      ),
    );
    return { data: registros.map((r) => toConsentimentoDto(r, nomes)) };
  }

  /** `POST .../consentimentos`: grava o registro (aceite ou revogação) e atualiza o cadastro. */
  async registrar(pacienteId: string, input: CreateConsentimentoInput): Promise<Consentimento> {
    await this.garantirPaciente(pacienteId);
    await this.vinculados.garantir(pacienteId);
    const criado = await this.gravar(pacienteId, input);
    const nomes = await this.usuarios.nomesPorIds(
      criado.registradoPorId ? [criado.registradoPorId] : [],
    );
    return toConsentimentoDto(criado, nomes);
  }

  /**
   * Usado pelo cadastro do paciente: grava só quando o tipo ainda não tem registro ou o valor
   * vigente é outro. Audita cada registro criado (não passa por `@Audit`).
   */
  async registrarSeMudou(pacienteId: string, input: CreateConsentimentoInput): Promise<boolean> {
    const vigente = await this.vigente(pacienteId, input.tipo);
    if (vigente && vigente.aceito === input.aceito) return false;
    const criado = await this.gravar(pacienteId, input);
    await this.audit.record({
      action: 'CREATE',
      entity: ENTIDADE_AUDITORIA,
      entityId: criado.id,
      before: null,
      after: {
        pacienteId,
        tipo: criado.tipo,
        aceito: criado.aceito,
        canal: criado.canal,
        versao: criado.versao,
      },
    });
    return true;
  }

  private vigente(pacienteId: string, tipo: ConsentimentoTipo) {
    return this.txHost.tx.consentimentoPaciente.findFirst({
      where: { pacienteId, tipo },
      orderBy: [{ registradoEm: 'desc' }, { id: 'desc' }],
      select: { aceito: true },
    });
  }

  private async gravar(
    pacienteId: string,
    input: CreateConsentimentoInput,
  ): Promise<ConsentimentoPaciente> {
    const criado = await this.txHost.tx.consentimentoPaciente.create({
      data: {
        pacienteId,
        tipo: input.tipo,
        aceito: input.aceito,
        canal: input.canal,
        versao: CONSENTIMENTO_VERSAO_ATUAL,
        observacao: input.observacao,
        registradoPorId: this.contexto.getUserId() ?? null,
      },
    });
    if (input.tipo === 'CAMPANHAS') {
      await this.txHost.tx.paciente.update({
        where: { id: pacienteId },
        data: { aceitaCampanhasWhatsapp: input.aceito },
      });
    } else if (input.tipo === 'COMUNICACAO') {
      await this.txHost.tx.paciente.update({
        where: { id: pacienteId },
        data: { aceitaComunicacao: input.aceito },
      });
    }
    return criado;
  }

  private async garantirPaciente(pacienteId: string): Promise<void> {
    const existe = isUuid(pacienteId)
      ? await this.txHost.tx.paciente.findFirst({
          where: { id: pacienteId, deletedAt: null },
          select: { id: true },
        })
      : null;
    if (!existe) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Paciente não encontrado', { status: 404 });
    }
  }
}
