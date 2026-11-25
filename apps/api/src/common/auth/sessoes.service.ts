import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import { isPermissao, type Permissao } from '@torres/shared';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { escopoDoUsuario } from './escopo-dados';
import { toPreferencias } from './preferencias-usuario';
import { gerarSegredo, hashToken, lerRefreshToken, montarRefreshToken } from './tokens';
import type { UsuarioAutenticado } from './usuario-autenticado';

export const USUARIO_COM_PERMISSOES = {
  perfil: { include: { permissoes: { select: { permissao: true } } } },
  profissionais: { select: { profissionalId: true } },
  preferencias: true,
} satisfies Prisma.UsuarioInclude;

export type UsuarioComPermissoes = Prisma.UsuarioGetPayload<{
  include: typeof USUARIO_COM_PERMISSOES;
}>;

export interface MetadadosSessao {
  ip?: string;
  userAgent?: string;
}

export interface SessaoEmitida {
  usuario: UsuarioAutenticado;
  refreshToken: string;
}

/** Permissões válidas do perfil. Perfil inativo ou excluído não concede nada. */
export function toUsuarioAutenticado(
  usuario: UsuarioComPermissoes,
  sessaoId: string,
): UsuarioAutenticado {
  const perfil = usuario.perfil;
  const ativo = perfil?.ativo === true && perfil.deletedAt === null;
  const permissoes = new Set<Permissao>(
    ativo ? perfil.permissoes.map((p) => p.permissao).filter(isPermissao) : [],
  );
  return {
    id: usuario.id,
    sessaoId,
    empresaId: usuario.empresaId,
    nome: usuario.nome,
    email: usuario.email,
    perfil: perfil ? { id: perfil.id, nome: perfil.nome } : null,
    permissoes,
    escopo: escopoDoUsuario(
      ativo ? perfil.escopoDados : null,
      usuario.profissionais.map((v) => v.profissionalId),
    ),
    verDadosSensiveis: usuario.verDadosSensiveis,
    avatarArquivoId: usuario.avatarArquivoId,
    trocarSenha: usuario.trocarSenhaNoAcesso,
    preferencias: toPreferencias(usuario.preferencias),
  };
}

/**
 * Sessões de login (refresh tokens). O banco guarda só o hash do token atual, que muda a
 * cada renovação. Um token antigo apresentado de novo indica roubo: a sessão é revogada.
 */
@Injectable()
export class SessoesService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async criar(usuario: UsuarioComPermissoes, meta: MetadadosSessao): Promise<SessaoEmitida> {
    const segredo = gerarSegredo();
    const sessao = await this.txHost.tx.sessao.create({
      data: {
        usuarioId: usuario.id,
        tokenHash: hashToken(segredo),
        expiraEm: this.novaExpiracao(),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
      },
    });
    return {
      usuario: toUsuarioAutenticado(usuario, sessao.id),
      refreshToken: montarRefreshToken(sessao.id, segredo),
    };
  }

  /** Troca o refresh token por um novo. `null`: token inválido, expirado, revogado ou reusado. */
  async rotacionar(refreshToken: string): Promise<SessaoEmitida | null> {
    const lido = lerRefreshToken(refreshToken);
    if (!lido) return null;

    const sessao = await this.txHost.tx.sessao.findUnique({
      where: { id: lido.sessaoId },
      include: { usuario: { include: USUARIO_COM_PERMISSOES } },
    });
    if (!sessao || sessao.revogadaEm || sessao.expiraEm <= new Date()) return null;

    const usuarioValido = sessao.usuario.ativo && sessao.usuario.deletedAt === null;
    if (sessao.tokenHash !== hashToken(lido.segredo) || !usuarioValido) {
      await this.revogarPorId(sessao.id);
      return null;
    }

    const segredo = gerarSegredo();
    // Só troca se o hash ainda for o lido: duas renovações simultâneas não geram dois tokens.
    const { count } = await this.txHost.tx.sessao.updateMany({
      where: { id: sessao.id, tokenHash: sessao.tokenHash, revogadaEm: null },
      data: {
        tokenHash: hashToken(segredo),
        expiraEm: this.novaExpiracao(),
        ultimoUsoEm: new Date(),
      },
    });
    if (count === 0) return null;

    return {
      usuario: toUsuarioAutenticado(sessao.usuario, sessao.id),
      refreshToken: montarRefreshToken(sessao.id, segredo),
    };
  }

  /** Encerra a sessão do refresh token (logout). Token inválido é ignorado. */
  async revogar(refreshToken: string): Promise<void> {
    const lido = lerRefreshToken(refreshToken);
    if (!lido) return;
    await this.txHost.tx.sessao.updateMany({
      where: { id: lido.sessaoId, tokenHash: hashToken(lido.segredo), revogadaEm: null },
      data: { revogadaEm: new Date() },
    });
  }

  /** Encerra todas as sessões do usuário (ex.: depois de trocar a senha). */
  async revogarTodas(usuarioId: string): Promise<void> {
    await this.txHost.tx.sessao.updateMany({
      where: { usuarioId, revogadaEm: null },
      data: { revogadaEm: new Date() },
    });
  }

  /** Encerra as sessões do usuário, menos a sessão informada (troca de senha: quem trocou continua logado). */
  async revogarOutras(usuarioId: string, sessaoId: string): Promise<void> {
    await this.txHost.tx.sessao.updateMany({
      where: { usuarioId, revogadaEm: null, id: { not: sessaoId } },
      data: { revogadaEm: new Date() },
    });
  }

  /**
   * Usuário de um access token: a sessão precisa estar ativa e o usuário ativo. Lido a cada
   * requisição, para que logout, desativação e mudança de perfil valham na hora.
   */
  async carregarUsuario(sessaoId: string, usuarioId: string): Promise<UsuarioAutenticado | null> {
    const sessao = await this.txHost.tx.sessao.findFirst({
      where: {
        id: sessaoId,
        usuarioId,
        revogadaEm: null,
        expiraEm: { gt: new Date() },
        usuario: { ativo: true, deletedAt: null },
      },
      include: { usuario: { include: USUARIO_COM_PERMISSOES } },
    });
    return sessao ? toUsuarioAutenticado(sessao.usuario, sessao.id) : null;
  }

  private async revogarPorId(id: string): Promise<void> {
    await this.txHost.tx.sessao.update({ where: { id }, data: { revogadaEm: new Date() } });
  }

  private novaExpiracao(): Date {
    return new Date(Date.now() + this.config.refreshTtlSeconds * 1000);
  }
}
