import { z } from 'zod';
import { TELAS, type TelaId } from '../menu/menu';

/** Ações de cada tela. `ver` libera a tela no menu; as demais, os botões e endpoints. */
export const ACOES = ['ver', 'criar', 'editar', 'excluir', 'exportar'] as const;

export type Acao = (typeof ACOES)[number];

/** Permissões que não são de uma tela do inventário. */
export const PERMISSOES_EXTRAS = [
  /** Validar ou recusar documento do profissional (issue #141): perfil distinto de quem envia. */
  'gestao-profissionais.profissionais-documentos.validar',
  /** Consulta do log de acesso de leitura ao prontuário (issue #150): só a administração. */
  'consultorio-assistencial.prontuarios-acessos.ver',
  /** Assinar o atendimento e registrar adendo (issue #151): só o profissional, não a recepção. */
  'consultorio-assistencial.prontuarios.assinar',
  /** Exportar dados pessoais ou clínicos em Excel/PDF (issue #156, R §41): além de <tela>.exportar. */
  'configuracoes-gestao.dados-pessoais.exportar',
  /** Criar, alterar e excluir os modelos de prontuário padrão da clínica (issue #152): gerência. */
  'consultorio-assistencial.modelos-prontuario.gerir',
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
