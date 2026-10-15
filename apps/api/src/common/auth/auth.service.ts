import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { EsqueciSenhaInput, LoginInput, RedefinirSenhaInput, Sessao } from '@torres/shared';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../context/request-context.service';
import { ApiException, BusinessException } from '../errors/api.exception';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import {
  NOTIFICADOR_REDEFINICAO_SENHA,
  type NotificadorRedefinicaoSenha,
} from './notificador-redefinicao-senha';
import { hashSenha, verificarSenha } from './senhas';
import {
  SessoesService,
  USUARIO_COM_PERMISSOES,
  type MetadadosSessao,
  type SessaoEmitida,
} from './sessoes.service';
import { gerarSegredo, hashToken } from './tokens';
import { toUsuarioSessao, type AccessTokenPayload } from './usuario-autenticado';

export const CREDENCIAIS_INVALIDAS = 'E-mail ou senha inválidos';
export const SESSAO_INVALIDA = 'Sessão expirada. Entre novamente';
export const LINK_REDEFINICAO_INVALIDO = 'Link de redefinição inválido ou expirado';

export interface SessaoComRefresh {
  sessao: Sessao;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly jwt: JwtService,
    private readonly sessoes: SessoesService,
    private readonly audit: AuditService,
    private readonly context: RequestContextService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(NOTIFICADOR_REDEFINICAO_SENHA)
    private readonly notificador: NotificadorRedefinicaoSenha,
  ) {}

  /**
   * E-mail inexistente, senha errada, usuário sem senha ou inativo: a mesma resposta 401,
   * para não revelar quais contas existem.
   */
  async login({ email, senha }: LoginInput, meta: MetadadosSessao): Promise<SessaoComRefresh> {
    const usuario = await this.txHost.tx.usuario.findFirst({
      where: { email, deletedAt: null },
      include: USUARIO_COM_PERMISSOES,
    });
    const senhaConfere = await verificarSenha(senha, usuario?.senhaHash ?? null);
    if (!usuario || !senhaConfere || !usuario.ativo) {
      throw new ApiException(401, 'CREDENCIAIS_INVALIDAS', CREDENCIAIS_INVALIDAS);
    }

    await this.txHost.tx.usuario.update({
      where: { id: usuario.id },
      data: { ultimoLoginEm: new Date() },
    });
    return this.emitir(await this.sessoes.criar(usuario, meta));
  }

  /** Renova a sessão pelo refresh token do cookie (e troca o token). */
  async refresh(refreshToken: string | undefined): Promise<SessaoComRefresh> {
    const sessao = refreshToken ? await this.sessoes.rotacionar(refreshToken) : null;
    if (!sessao) throw new ApiException(401, 'SESSAO_INVALIDA', SESSAO_INVALIDA);
    return this.emitir(sessao);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.sessoes.revogar(refreshToken);
  }

  /**
   * Gera o link de redefinição e pede o envio. Sempre termina sem erro, exista ou não o
   * e-mail, para não revelar contas. Pedidos anteriores do usuário deixam de valer.
   */
  async esqueciSenha({ email }: EsqueciSenhaInput): Promise<void> {
    const usuario = await this.txHost.tx.usuario.findFirst({
      where: { email, deletedAt: null, ativo: true },
      select: { id: true },
    });
    if (!usuario) return;

    const token = gerarSegredo();
    const expiraEm = new Date(Date.now() + this.config.resetTtlSeconds * 1000);
    await this.txHost.withTransaction(async () => {
      await this.txHost.tx.redefinicaoSenha.deleteMany({
        where: { usuarioId: usuario.id, usadaEm: null },
      });
      await this.txHost.tx.redefinicaoSenha.create({
        data: { usuarioId: usuario.id, tokenHash: hashToken(token), expiraEm },
      });
    });
    await this.notificador.enviar({ usuarioId: usuario.id, token, expiraEm });
  }

  /**
   * Troca a senha pelo link (uso único) e encerra todas as sessões do usuário.
   * A alteração é auditada como UPDATE de Usuario, sem o hash da senha.
   */
  async redefinirSenha({ token, senha }: RedefinirSenhaInput): Promise<void> {
    const senhaHash = await hashSenha(senha);

    await this.txHost.withTransaction(async () => {
      const pedido = await this.txHost.tx.redefinicaoSenha.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { usuario: true },
      });
      const valido =
        pedido !== null &&
        pedido.usadaEm === null &&
        pedido.expiraEm > new Date() &&
        pedido.usuario.ativo &&
        pedido.usuario.deletedAt === null;
      if (!valido) {
        throw new BusinessException('LINK_REDEFINICAO_INVALIDO', LINK_REDEFINICAO_INVALIDO, {
          status: 400,
          details: [{ field: 'token', message: LINK_REDEFINICAO_INVALIDO }],
        });
      }

      const after = await this.txHost.tx.usuario.update({
        where: { id: pedido.usuarioId },
        data: { senhaHash },
      });
      await this.txHost.tx.redefinicaoSenha.update({
        where: { id: pedido.id },
        data: { usadaEm: new Date() },
      });
      await this.sessoes.revogarTodas(pedido.usuarioId);

      // Quem altera é o próprio usuário, identificado pelo link.
      this.context.setUserId(pedido.usuarioId);
      await this.audit.record({
        action: 'UPDATE',
        entity: 'Usuario',
        entityId: pedido.usuarioId,
        before: pedido.usuario,
        after,
      });
    });
  }

  private async emitir({ usuario, refreshToken }: SessaoEmitida): Promise<SessaoComRefresh> {
    const payload: AccessTokenPayload = { sub: usuario.id, sid: usuario.sessaoId };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.config.accessTtlSeconds,
    });
    const expiraEm = new Date(Date.now() + this.config.accessTtlSeconds * 1000).toISOString();
    return { sessao: { accessToken, expiraEm, usuario: toUsuarioSessao(usuario) }, refreshToken };
  }
}
