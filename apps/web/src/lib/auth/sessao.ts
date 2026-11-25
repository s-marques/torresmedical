import {
  sessaoSchema,
  type EsqueciSenhaInput,
  type LoginInput,
  type RedefinirSenhaInput,
  type Sessao,
  type TrocarSenhaInput,
  type UsuarioSessao,
} from '@torres/shared';
import { apiFetch, configurarAutenticacao } from '../api/client';

export type EstadoSessao =
  | { status: 'carregando' }
  | { status: 'anonimo' }
  | { status: 'autenticado'; usuario: UsuarioSessao };

/**
 * Sessão do usuário. O access token fica só em memória (nunca em localStorage): ao abrir o
 * app, a sessão é retomada pelo refresh token, que está num cookie httpOnly inacessível ao JS.
 */
let estado: EstadoSessao = { status: 'carregando' };
let accessToken: string | null = null;
const ouvintes = new Set<() => void>();

function definir(novo: EstadoSessao, token: string | null): void {
  estado = novo;
  accessToken = token;
  for (const ouvinte of ouvintes) ouvinte();
}

function aplicar(sessao: Sessao): void {
  definir({ status: 'autenticado', usuario: sessao.usuario }, sessao.accessToken);
}

export function obterSessao(): EstadoSessao {
  return estado;
}

/**
 * Atualiza os dados do usuário logado sem nova chamada à API (ex.: nome, avatar e
 * preferências salvos na tela Configurações). Sem sessão, não faz nada.
 */
export function atualizarUsuarioSessao(
  alterar: (usuario: UsuarioSessao) => Partial<UsuarioSessao>,
): void {
  if (estado.status !== 'autenticado') return;
  const usuario = { ...estado.usuario, ...alterar(estado.usuario) };
  definir({ status: 'autenticado', usuario }, accessToken);
}

export function assinarSessao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export async function entrar(dados: LoginInput): Promise<UsuarioSessao> {
  const sessao = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: dados,
    schema: sessaoSchema,
    autenticar: false,
  });
  aplicar(sessao);
  return sessao.usuario;
}

let renovacao: Promise<boolean> | null = null;

/**
 * Renova a sessão pelo cookie. Chamadas simultâneas na aba esperam a mesma renovação; entre
 * abas, o Web Locks API garante uma por vez (o refresh token muda a cada uso e o reuso de um
 * token antigo encerra a sessão no servidor).
 */
export function renovarSessao(): Promise<boolean> {
  renovacao ??= comLock(async () => {
    try {
      aplicar(
        await apiFetch('/api/auth/refresh', {
          method: 'POST',
          schema: sessaoSchema,
          autenticar: false,
        }),
      );
      return true;
    } catch {
      definir({ status: 'anonimo' }, null);
      return false;
    }
  }).finally(() => {
    renovacao = null;
  });
  return renovacao;
}

async function comLock<T>(tarefa: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return tarefa();
  return await locks.request('torres-renovar-sessao', tarefa);
}

/** Retoma a sessão ao abrir o app (uma vez). */
export function iniciarSessao(): void {
  if (estado.status === 'carregando' && !renovacao) void renovarSessao();
}

/** Encerra a sessão no servidor e localmente. Falha de rede não impede sair. */
export async function sair(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST', autenticar: false });
  } catch {
    // Sai localmente mesmo assim: o cookie expira sozinho.
  } finally {
    definir({ status: 'anonimo' }, null);
  }
}

/** 401 que a renovação não resolveu: a sessão acabou. */
export function encerrarSessaoLocal(): void {
  definir({ status: 'anonimo' }, null);
}

export async function pedirRedefinicaoSenha(dados: EsqueciSenhaInput): Promise<void> {
  await apiFetch('/api/auth/esqueci-senha', { method: 'POST', body: dados, autenticar: false });
}

export async function redefinirSenha(dados: RedefinirSenhaInput): Promise<void> {
  await apiFetch('/api/auth/redefinir-senha', { method: 'POST', body: dados, autenticar: false });
}

/**
 * Troca a própria senha (issue #156). As outras sessões caem no servidor; esta continua, e a
 * troca pendente deixa de valer na hora.
 */
export async function trocarSenha(dados: TrocarSenhaInput): Promise<void> {
  await apiFetch('/api/auth/trocar-senha', { method: 'POST', body: dados });
  atualizarUsuarioSessao(() => ({ trocarSenha: false }));
}

configurarAutenticacao({ token: () => accessToken, renovar: renovarSessao });

/** Só para testes: volta ao estado inicial. */
export function reiniciarSessaoParaTestes(): void {
  renovacao = null;
  definir({ status: 'carregando' }, null);
}
