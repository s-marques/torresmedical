import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import { SessoesService } from './sessoes.service';

export type MotivoEncerramentoAcesso = 'PROFISSIONAL_SEM_CONTRATO' | 'PROFISSIONAL_INATIVO';

/** Usuário ativo vinculado a um profissional, com todos os profissionais a que ele está ligado. */
export interface UsuarioVinculado {
  usuarioId: string;
  profissionalIds: string[];
}

/**
 * Encerramento de acesso (issue #156, R §41): desativa o usuário, derruba as sessões e deixa o
 * registro no `audit_log`. Quem decide *quando* encerrar é o módulo dono da regra (por exemplo
 * `AcessoProfissionalService`, de gestao-profissionais); aqui fica só a execução.
 * Funciona fora de uma requisição HTTP (agendador): a auditoria sai com o usuário `system`.
 */
@Injectable()
export class EncerramentoAcessoService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly sessoes: SessoesService,
    private readonly audit: AuditService,
  ) {}

  /** Usuários ativos ligados ao profissional, com os demais profissionais de cada um. */
  async usuariosVinculados(profissionalId: string): Promise<UsuarioVinculado[]> {
    const usuarios = await this.txHost.tx.usuario.findMany({
      where: {
        ativo: true,
        deletedAt: null,
        profissionais: { some: { profissionalId } },
      },
      select: { id: true, profissionais: { select: { profissionalId: true } } },
    });
    return usuarios.map((u) => ({
      usuarioId: u.id,
      profissionalIds: u.profissionais.map((v) => v.profissionalId),
    }));
  }

  /**
   * Desativa o usuário e revoga todas as sessões. Idempotente: usuário já inativo é ignorado.
   * Devolve `true` quando encerrou.
   */
  async encerrar(usuarioId: string, motivo: MotivoEncerramentoAcesso): Promise<boolean> {
    return this.txHost.withTransaction(async () => {
      const antes = await this.txHost.tx.usuario.findFirst({
        where: { id: usuarioId, ativo: true, deletedAt: null },
      });
      if (!antes) return false;

      const depois = await this.txHost.tx.usuario.update({
        where: { id: usuarioId },
        data: { ativo: false },
      });
      await this.sessoes.revogarTodas(usuarioId);
      await this.audit.record({
        action: 'UPDATE',
        entity: 'Usuario',
        entityId: usuarioId,
        before: { ...antes, motivo: null },
        after: { ...depois, motivo },
      });
      return true;
    });
  }
}
