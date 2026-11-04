import { z } from 'zod';
import { exportQuerySchema, searchSchema } from '../common/list-query';
import { mensagemObrigatoria, textoObrigatorio } from '../common/obrigatorio';

export const PLANO_CONTA_CODIGO_MAX = 30;
export const PLANO_CONTA_NOME_MAX = 150;

/** Tipos do combo do modal e do filtro da listagem (minúsculos na entrada; o banco usa maiúsculas). */
export const PLANO_CONTA_TIPOS = ['receita', 'despesa', 'ativo', 'passivo'] as const;
export type PlanoContaTipo = (typeof PLANO_CONTA_TIPOS)[number];

const tipo = z.enum(PLANO_CONTA_TIPOS, { error: mensagemObrigatoria('Tipo') });

const codigo = textoObrigatorio('Código', { max: PLANO_CONTA_CODIGO_MAX });
const nome = textoObrigatorio('Nome', { max: PLANO_CONTA_NOME_MAX });

/** Conta Pai vazia ("Nenhuma (raiz)") chega como `null`. */
const contaPaiId = z.uuid({ error: 'Conta pai inválida' }).nullable();

/** `POST /api/financeiro/plano-contas`. Código, Tipo e Nome são obrigatórios. */
export const createPlanoContaSchema = z.strictObject({
  codigo,
  tipo,
  nome,
  contaPaiId: contaPaiId.default(null),
});

export type CreatePlanoContaInput = z.infer<typeof createPlanoContaSchema>;
export type PlanoContaFormulario = z.input<typeof createPlanoContaSchema>;

/** `PATCH /api/financeiro/plano-contas/:id`. `ativo` é o interruptor da linha. */
export const updatePlanoContaSchema = z
  .strictObject({
    codigo: codigo.optional(),
    tipo: tipo.optional(),
    nome: nome.optional(),
    contaPaiId: contaPaiId.optional(),
    ativo: z.boolean({ error: 'Valor inválido' }).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Informe ao menos um campo para alterar',
  });

export type UpdatePlanoContaInput = z.infer<typeof updatePlanoContaSchema>;

/** `GET /api/financeiro/plano-contas`. Sem paginação: a tela mostra a árvore inteira. */
export const listPlanoContasQuerySchema = z.object({
  search: searchSchema,
  tipo: tipo.optional(),
});

export type ListPlanoContasQuery = z.infer<typeof listPlanoContasQuerySchema>;

export const PLANO_CONTA_EXPORT_COLUMNS = ['codigo', 'nome', 'tipo', 'nivel', 'ativo'] as const;
export type PlanoContaExportColumn = (typeof PLANO_CONTA_EXPORT_COLUMNS)[number];

/** `GET /api/financeiro/plano-contas/export` (botão Imprimir). */
export const exportPlanoContasQuerySchema = exportQuerySchema(
  listPlanoContasQuerySchema,
  PLANO_CONTA_EXPORT_COLUMNS,
);

export type ExportPlanoContasQuery = z.infer<typeof exportPlanoContasQuerySchema>;

export const planoContaSchema = z.object({
  id: z.uuid(),
  codigo: z.string(),
  nome: z.string(),
  /** Valores do banco (iguais ao `audit_log`). */
  tipo: z.enum(['RECEITA', 'DESPESA', 'ATIVO', 'PASSIVO']),
  nivel: z.number().int(),
  contaPaiId: z.uuid().nullable(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type PlanoConta = z.infer<typeof planoContaSchema>;

export const planoContaListaSchema = z.object({
  data: z.array(planoContaSchema),
  total: z.number().int().min(0),
});

export type PlanoContaLista = z.infer<typeof planoContaListaSchema>;

/** Rótulos do grid, do filtro e da exportação (valor do banco → texto). */
export const PLANO_CONTA_ROTULO_TIPO: Readonly<Record<PlanoConta['tipo'], string>> = {
  RECEITA: 'Receita',
  DESPESA: 'Despesa',
  ATIVO: 'Ativo',
  PASSIVO: 'Passivo',
};

/** Ordem natural dos códigos: "6.1.2" vem antes de "6.1.10" e o pai antes dos filhos. */
export function compararCodigosConta(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { numeric: true });
}
