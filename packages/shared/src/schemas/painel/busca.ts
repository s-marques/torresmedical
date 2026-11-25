import { z } from 'zod';
import type { Permissao } from '../../auth/permissoes';
import { traduzirValidacao } from '../../i18n/validacao';
import { textoObrigatorio } from '../common/obrigatorio';

/**
 * Busca global do ⌘K (issue #159): um campo único que encontra pacientes, profissionais,
 * contratos de sala, fornecedores e leads (negócios do funil) por nome, CPF/CNPJ, telefone,
 * CRM (registro no conselho) e nº do contrato.
 */
export const TIPOS_BUSCA = ['PACIENTE', 'PROFISSIONAL', 'CONTRATO', 'FORNECEDOR', 'LEAD'] as const;
export type TipoBusca = (typeof TIPOS_BUSCA)[number];
export const tipoBuscaSchema = z.enum(TIPOS_BUSCA);

/** Tamanho mínimo do termo (evita varrer a base com 1 caractere), salvo número. */
export const BUSCA_TERMO_MINIMO = 2;
export const BUSCA_TERMO_MAXIMO = 80;
/** Máximo de resultados por tipo. */
export const BUSCA_LIMITE_POR_TIPO = 5;

/** Quem vê a tela da lista vê o tipo na busca (permissão da tela de origem do dado). */
export const PERMISSAO_BUSCA: Readonly<Record<TipoBusca, Permissao>> = {
  PACIENTE: 'comercial-atendimento.pacientes.ver',
  PROFISSIONAL: 'gestao-profissionais.profissionais.ver',
  CONTRATO: 'gestao-profissionais.salas.ver',
  FORNECEDOR: 'compras-estoque.fornecedores.ver',
  LEAD: 'comercial-atendimento.negocios.ver',
};

/** Termo curto só vale se for número (nº de contrato de um dígito). */
function termoValido(termo: string): boolean {
  return termo.length >= BUSCA_TERMO_MINIMO || /^\d+$/.test(termo);
}

export const buscaGlobalQuerySchema = z.strictObject({
  q: textoObrigatorio('Busca', { genero: 'f', max: BUSCA_TERMO_MAXIMO }).refine(termoValido, {
    error: () => traduzirValidacao('validacao.textoMin', { count: BUSCA_TERMO_MINIMO }),
  }),
});
export type BuscaGlobalQuery = z.output<typeof buscaGlobalQuerySchema>;

export const itemBuscaSchema = z.object({
  id: z.uuid(),
  titulo: z.string(),
  /** Documento mascarado, registro no conselho, nº do contrato… */
  descricao: z.string().nullable(),
  /** Rota do front com a lista já filtrada pelo termo. */
  rota: z.string(),
});
export type ItemBusca = z.infer<typeof itemBuscaSchema>;

export const grupoBuscaSchema = z.object({
  tipo: tipoBuscaSchema,
  itens: z.array(itemBuscaSchema),
});
export type GrupoBusca = z.infer<typeof grupoBuscaSchema>;

/** Só os tipos que o usuário pode ver e que têm resultado, na ordem de `TIPOS_BUSCA`. */
export const buscaGlobalResponseSchema = z.object({ grupos: z.array(grupoBuscaSchema) });
export type BuscaGlobalResponse = z.infer<typeof buscaGlobalResponseSchema>;
