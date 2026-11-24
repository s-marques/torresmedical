import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  ListProntuarioAcessosQuery,
  ProntuarioAcesso,
  ProntuarioAcessoPage,
  ProntuarioAcessoRecurso,
} from '@torres/shared';
import type { ProntuarioAcesso as ProntuarioAcessoModel } from '../../../generated/prisma/client';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import { SYSTEM_USER_ID } from '../../../common/audit/audit.constants';
import { RequestContextService } from '../../../common/context/request-context.service';
import { paginate } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

function toDto(registro: ProntuarioAcessoModel): ProntuarioAcesso {
  return {
    id: registro.id,
    usuarioId: registro.usuarioId,
    pacienteId: registro.pacienteId,
    recurso: registro.recurso as ProntuarioAcessoRecurso,
    acessadoEm: registro.acessadoEm.toISOString(),
    requestId: registro.requestId,
    ip: registro.ip,
  };
}

/**
 * Log de acesso de leitura ao prontuário (issue #150, mapa mental p. 2: "Log de acesso e
 * alterações"). A escrita clínica continua no `audit_log`; aqui entra só quem abriu o quê e
 * quando. A tabela só aceita inserção e guarda ids, nunca conteúdo clínico (CLAUDE.md, seção 6).
 */
@Injectable()
export class AcessoProntuarioService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly context: RequestContextService,
    private readonly escopo: EscopoDadosService,
  ) {}

  /** Chamar só depois de o escopo liberar o paciente: acesso negado (403/404) não é registrado. */
  async registrar(pacienteId: string, recurso: ProntuarioAcessoRecurso): Promise<void> {
    await this.txHost.tx.prontuarioAcesso.create({
      data: {
        usuarioId: this.context.getUserId() ?? SYSTEM_USER_ID,
        pacienteId,
        recurso,
        requestId: this.context.getRequestId() ?? null,
        ip: this.context.getIp() ?? null,
      },
    });
  }

  /** Visão geral da administração: usuário com escopo restrito não consulta o log. */
  async listar(query: ListProntuarioAcessosQuery): Promise<ProntuarioAcessoPage> {
    if (this.escopo.restrito()) throw semPermissao();
    const where = {
      pacienteId: query.pacienteId,
      usuarioId: query.usuarioId,
      recurso: query.recurso,
    };
    const pagina = await paginate(query, {
      findMany: (args) =>
        this.txHost.tx.prontuarioAcesso.findMany({
          where,
          orderBy: [{ acessadoEm: 'desc' }, { id: 'desc' }],
          ...args,
        }),
      count: () => this.txHost.tx.prontuarioAcesso.count({ where }),
    });
    return { ...pagina, data: pagina.data.map(toDto) };
  }
}
