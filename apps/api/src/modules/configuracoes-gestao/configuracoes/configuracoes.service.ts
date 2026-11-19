import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  AtualizarPreferenciasInput,
  MeuPerfil,
  MeuPerfilInput,
  Preferencias,
} from '@torres/shared';
import type { Usuario } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { toPreferencias } from '../../../common/auth/preferencias-usuario';
import { BusinessException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ArquivosService } from '../../../common/storage/arquivos.service';
import { UsuariosService } from '../usuarios/usuarios.service';

function toMeuPerfil(usuario: Usuario): MeuPerfil {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    telefone: usuario.telefone,
    cargo: usuario.cargo,
    avatarArquivoId: usuario.avatarArquivoId,
    updatedAt: usuario.updatedAt.toISOString(),
  };
}

/**
 * Tela "Configurações" (`/settings`, issue #30): dados e preferências do **próprio** usuário
 * logado. `usuarioId` sempre vem da sessão, nunca da URL. Sem `:id` nas rotas, a auditoria é
 * gravada aqui, com o `before` de verdade (CLAUDE.md, seção 4); `senhaHash` sai pelo AuditService.
 */
@Injectable()
export class ConfiguracoesService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly usuarios: UsuariosService,
    private readonly arquivos: ArquivosService,
    private readonly audit: AuditService,
  ) {}

  async obterPerfil(usuarioId: string): Promise<MeuPerfil> {
    return toMeuPerfil(await this.buscarUsuario(usuarioId));
  }

  /** "Salvar Alterações" da aba Perfil. O e-mail é o login: precisa estar livre. */
  @Transactional()
  async atualizarPerfil(usuarioId: string, input: MeuPerfilInput): Promise<MeuPerfil> {
    const antes = await this.buscarUsuario(usuarioId);
    if (input.email !== antes.email)
      await this.usuarios.ensureEmailDisponivel(input.email, usuarioId);
    const depois = await this.txHost.tx.usuario.update({ where: { id: usuarioId }, data: input });
    await this.auditarUsuario(antes, depois);
    return toMeuPerfil(depois);
  }

  /** "Enviar avatar": o arquivo já foi enviado em `/api/arquivos` com o uso `avatar`. */
  @Transactional()
  async definirAvatar(usuarioId: string, arquivoId: string | null): Promise<MeuPerfil> {
    if (arquivoId) {
      const arquivo = await this.arquivos.findById(arquivoId);
      if (arquivo.uso !== 'avatar') {
        throw new BusinessException('ARQUIVO_USO_INVALIDO', 'Arquivo inválido para este campo', {
          status: 400,
          details: [{ field: 'arquivoId', message: 'O arquivo enviado não é do tipo esperado' }],
        });
      }
    }
    const antes = await this.buscarUsuario(usuarioId);
    const depois = await this.txHost.tx.usuario.update({
      where: { id: usuarioId },
      data: { avatarArquivoId: arquivoId },
    });
    await this.auditarUsuario(antes, depois);
    return toMeuPerfil(depois);
  }

  async obterPreferencias(usuarioId: string): Promise<Preferencias> {
    return toPreferencias(
      await this.txHost.tx.preferenciaUsuario.findUnique({ where: { usuarioId } }),
    );
  }

  /**
   * Abas Preferências e Aparência: grava só o que mudou. A primeira gravação cria a linha
   * (auditada como CREATE); as seguintes, UPDATE.
   */
  @Transactional()
  async atualizarPreferencias(
    usuarioId: string,
    input: AtualizarPreferenciasInput,
  ): Promise<Preferencias> {
    const antes = await this.txHost.tx.preferenciaUsuario.findUnique({ where: { usuarioId } });
    const depois = await this.txHost.tx.preferenciaUsuario.upsert({
      where: { usuarioId },
      create: { ...toPreferencias(null), ...input, usuarioId },
      update: input,
    });
    await this.audit.record({
      action: antes ? 'UPDATE' : 'CREATE',
      entity: 'PreferenciaUsuario',
      entityId: usuarioId,
      before: antes,
      after: depois,
    });
    return toPreferencias(depois);
  }

  private buscarUsuario(usuarioId: string): Promise<Usuario> {
    return this.txHost.tx.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
  }

  private auditarUsuario(antes: Usuario, depois: Usuario): Promise<void> {
    return this.audit.record({
      action: 'UPDATE',
      entity: 'Usuario',
      entityId: depois.id,
      before: antes,
      after: depois,
    });
  }
}
