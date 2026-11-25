import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  EsqueciSenhaInput,
  LoginInput,
  RedefinirSenhaInput,
  Sessao,
  TrocarSenhaInput,
} from '@torres/shared';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../context/request-context.service';
import { ApiException, BusinessException } from '../errors/api.exception';
import type { PrismaAdapter } from '../prisma/prisma-transaction';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import {
  NOTIFICADOR_REDEFINICAO_SENHA,
  type NotificadorRedefinicaoSenha,
} from './notificador-redefinicao-senha';
import { PoliticaSegurancaService } from './politica-seguranca.service';
import { hashSenha, verificarSenha } from './senhas';
import {
  SessoesService,
  USUARIO_COM_PERMISSOES,
  type MetadadosSessao,
  type SessaoEmitida,
  type UsuarioComPermissoes,
} from './sessoes.service';
import { gerarSegredo, hashToken } from './tokens';
import {
  toUsuarioSessao,
  type AccessTokenPayload,
  type UsuarioAutenticado,
} from './usuario-autenticado';

export const CREDENCIAIS_INVALIDAS = 'E-mail ou senha inválidos';
export const SESSAO_INVALIDA = 'Sessão expirada. Entre novamente';
export const LINK_REDEFINICAO_INVALIDO = 'Link de redefinição inválido ou expirado';
export const SENHA_ATUAL_INCORRETA = 'A senha atual está incorreta';

const DIA_MS = 86_400_000;

/** Senha mais antiga que a expiração da política (quando ligada). Sem troca registrada, vale a criação da conta. */
function senhaVenceu(
  usuario: Pick<UsuarioComPermissoes, 'senhaAlteradaEm' | 'createdAt'>,
  expiracaoDias: number | null,
  agora: Date,
): boolean {
  if (expiracaoDias === null) return false;
  const desde = usuario.senhaAlteradaEm ?? usuario.createdAt;
  return agora.getTime() - desde.getTime() > expiracaoDias * DIA_MS;
}

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
    private readonly politica: PoliticaSegurancaService,
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
    const agora = new Date();
    // Conta bloqueada: a resposta é a mesma de senha errada (não revela que a conta existe),
    // e nem a senha certa entra até o bloqueio acabar. Redefinir a senha também desbloqueia.
    const bloqueada = usuario?.bloqueadoAte != null && usuario.bloqueadoAte > agora;
    if (!usuario || !senhaConfere || !usuario.ativo || bloqueada) {
      if (usuario?.ativo && !bloqueada) await this.registrarFalha(usuario, agora);
      throw new ApiException(401, 'CREDENCIAIS_INVALIDAS', CREDENCIAIS_INVALIDAS);
    }

    const politica = await this.politica.obter(usuario.empresaId);
    const logado = await this.txHost.tx.usuario.update({
      where: { id: usuario.id },
      data: {
        ultimoLoginEm: agora,
        tentativasFalhas: 0,
        bloqueadoAte: null,
        // Senha vencida (expiração periódica, quando ligada): exige a troca neste acesso.
        ...(senhaVenceu(usuario, politica.expiracaoDias, agora) && { trocarSenhaNoAcesso: true }),
      },
      include: USUARIO_COM_PERMISSOES,
    });
    return this.emitir(await this.sessoes.criar(logado, meta));
  }

  /**
   * Conta a falha de login. Na tentativa que atinge o limite da política, bloqueia a conta pelo
   * tempo configurado e grava a auditoria (o login não tem usuário na requisição: o dono é a conta).
   */
  private async registrarFalha(usuario: UsuarioComPermissoes, agora: Date): Promise<void> {
    const politica = await this.politica.obter(usuario.empresaId);
    const { tentativasFalhas } = await this.txHost.tx.usuario.update({
      where: { id: usuario.id },
      data: { tentativasFalhas: { increment: 1 } },
      select: { tentativasFalhas: true },
    });
    if (tentativasFalhas < politica.tentativasBloqueio) return;

    const bloqueadoAte = new Date(agora.getTime() + politica.minutosBloqueio * 60_000);
    await this.txHost.tx.usuario.update({
      where: { id: usuario.id },
      data: { tentativasFalhas: 0, bloqueadoAte },
    });
    await this.audit.record({
      action: 'UPDATE',
      entity: 'Usuario',
      entityId: usuario.id,
      userId: usuario.id,
      before: { bloqueadoAte: usuario.bloqueadoAte, motivo: null },
      after: { bloqueadoAte, motivo: 'TENTATIVAS_DE_LOGIN' },
    });
  }

  /**
   * Troca a senha do próprio usuário (senha provisória, vencida ou por vontade dele). Exige a
   * senha atual, aplica a política e encerra as outras sessões; a atual continua valendo.
   */
  async trocarSenha(
    usuario: UsuarioAutenticado,
    { senhaAtual, senhaNova }: TrocarSenhaInput,
  ): Promise<void> {
    const atual = await this.txHost.tx.usuario.findUniqueOrThrow({
      where: { id: usuario.id },
    });
    if (!(await verificarSenha(senhaAtual, atual.senhaHash))) {
      throw new BusinessException('SENHA_ATUAL_INCORRETA', SENHA_ATUAL_INCORRETA, {
        status: 400,
        details: [{ field: 'senhaAtual', message: SENHA_ATUAL_INCORRETA }],
      });
    }
    await this.politica.garantirSenhaValida(atual.empresaId, senhaNova, 'senhaNova');

    const senhaHash = await hashSenha(senhaNova);
    await this.txHost.withTransaction(async () => {
      const depois = await this.txHost.tx.usuario.update({
        where: { id: usuario.id },
        data: { senhaHash, senhaAlteradaEm: new Date(), trocarSenhaNoAcesso: false },
      });
      await this.sessoes.revogarOutras(usuario.id, usuario.sessaoId);
      await this.audit.record({
        action: 'UPDATE',
        entity: 'Usuario',
        entityId: usuario.id,
        before: atual,
        after: depois,
      });
    });
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

      await this.politica.garantirSenhaValida(pedido.usuario.empresaId, senha);

      const after = await this.txHost.tx.usuario.update({
        where: { id: pedido.usuarioId },
        // Quem redefine pelo link escolheu a senha agora: não há troca pendente nem bloqueio.
        data: {
          senhaHash,
          senhaAlteradaEm: new Date(),
          trocarSenhaNoAcesso: false,
          tentativasFalhas: 0,
          bloqueadoAte: null,
        },
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
