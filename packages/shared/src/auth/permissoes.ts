import { z } from 'zod';
import { TELAS, type TelaId } from '../menu/menu';

/** Ações de cada tela. `ver` libera a tela no menu; as demais, os botões e endpoints. */
export const ACOES = ['ver', 'criar', 'editar', 'excluir', 'exportar'] as const;

export type Acao = (typeof ACOES)[number];

/** Permissões que não são de uma tela do inventário. */
export const PERMISSOES_EXTRAS = [
  /** Consulta do audit_log (restrita ao Administrador, CLAUDE.md seção 4). */
  'configuracoes-gestao.auditoria.ver',
] as const;

/** Permissão no formato `<modulo>.<recurso>.<acao>` (CLAUDE.md, seção 3). */
export type Permissao = `${TelaId}.${Acao}` | (typeof PERMISSOES_EXTRAS)[number];

/** Catálogo completo: cada tela × cada ação, mais as permissões extras. */
export const PERMISSOES: readonly Permissao[] = [
  ...TELAS.flatMap((tela) => ACOES.map((acao): Permissao => `${tela.id}.${acao}`)),
  ...PERMISSOES_EXTRAS,
];

const CATALOGO: ReadonlySet<string> = new Set(PERMISSOES);

export function isPermissao(valor: string): valor is Permissao {
  return CATALOGO.has(valor);
}

export const permissaoSchema = z
  .string()
  .refine((valor): valor is Permissao => isPermissao(valor), { error: 'Permissão inválida' });
