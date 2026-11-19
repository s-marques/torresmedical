import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { erroObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

/**
 * Tela Baixa de Insumos (`/baixa-insumos`, issue #17). Cada baixa registra o responsável, a data
 * e os itens, e subtrai o saldo dos produtos pela tela Estoque (`EstoqueService`), o que alimenta
 * o consumo médio da sugestão de compra. A baixa é imutável: corrigir é com o ajuste de estoque.
 *
 * Paciente opcional, quantidade inteira e baixa imutável: sugestões da IA aceitas pelo dev na
 * issue #17.
 */

export const BAIXA_TEXTO_MAX = 50;
export const BAIXA_OBSERVACAO_MAX = 500;
export const BAIXA_ITENS_MAX = 100;
export const BAIXA_QUANTIDADE_MAX = 999_999;

const idOpcional = (rotulo: string) =>
  z
    .uuid({ error: `${rotulo} inválido` })
    .nullish()
    .transform((valor) => valor ?? null);

const textoOpcional = (rotulo: string, max: number) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

export const baixaItemSchema = z.strictObject({
  produtoId: z
    .string({ error: erroObrigatorio('Insumo') })
    .min(1, { error: erroObrigatorio('Insumo') })
    .pipe(z.uuid({ error: 'Insumo inválido' })),
  quantidade: z
    .number({ error: erroObrigatorio('Quantidade', 'f') })
    .int({ error: 'A quantidade deve ser um número inteiro' })
    .positive({ error: 'A quantidade deve ser maior que zero' })
    .max(BAIXA_QUANTIDADE_MAX, { error: 'Quantidade inválida' }),
});
export type BaixaItemInput = z.output<typeof baixaItemSchema>;

/** `POST /api/compras-estoque/baixas-insumos` (modal "Nova Baixa de Insumos"). */
export const baixaInsumoInputSchema = z
  .strictObject({
    pacienteId: idOpcional('Paciente'),
    profissionalId: idOpcional('Profissional'),
    unidadeId: idOpcional('Unidade'),
    pressaoArterial: textoOpcional('Pressão Arterial', BAIXA_TEXTO_MAX),
    dextro: textoOpcional('Dextro (Glicemia)', BAIXA_TEXTO_MAX),
    observacao: textoOpcional('Observação', BAIXA_OBSERVACAO_MAX),
    itens: z
      .array(baixaItemSchema, { error: 'Selecione ao menos um insumo.' })
      .min(1, { error: 'Selecione ao menos um insumo.' })
      .max(BAIXA_ITENS_MAX, { error: `No máximo ${BAIXA_ITENS_MAX} insumos por baixa.` }),
  })
  .refine((v) => new Set(v.itens.map((i) => i.produtoId)).size === v.itens.length, {
    error: 'Há insumos repetidos. Some as quantidades em uma só linha.',
    path: ['itens'],
  });
export type BaixaInsumoFormulario = z.input<typeof baixaInsumoInputSchema>;
export type BaixaInsumoInput = z.output<typeof baixaInsumoInputSchema>;

// --- Consultas ---

export const BAIXA_SORT_FIELDS = ['data', 'paciente', 'profissional', 'unidade'] as const;

const dataFiltro = (rotulo: string) =>
  z
    .string()
    .optional()
    .transform((valor) => valor || undefined)
    .pipe(z.iso.date({ error: `${rotulo} inválida` }).optional());

/** `GET /api/compras-estoque/baixas-insumos`: filtros Data Início e Data Fim. */
export const listBaixasInsumosQuerySchema = listQuerySchema({
  sortFields: BAIXA_SORT_FIELDS,
  defaultSort: 'data:desc',
  filters: {
    dataInicio: dataFiltro('Data Início'),
    dataFim: dataFiltro('Data Fim'),
  },
});
export type ListBaixasInsumosQuery = z.infer<typeof listBaixasInsumosQuerySchema>;

// --- Respostas ---

export const baixaItemRespostaSchema = z.object({
  produtoId: z.uuid(),
  produtoNome: z.string(),
  quantidade: z.string(),
});

export const baixaInsumoSchema = z.object({
  id: z.uuid(),
  pacienteId: z.uuid().nullable(),
  pacienteNome: z.string().nullable(),
  profissionalId: z.uuid().nullable(),
  profissionalNome: z.string().nullable(),
  unidadeId: z.uuid().nullable(),
  unidadeNome: z.string().nullable(),
  pressaoArterial: z.string().nullable(),
  dextro: z.string().nullable(),
  observacao: z.string().nullable(),
  /** Usuário responsável (do contexto da requisição). */
  responsavelId: z.uuid().nullable(),
  responsavelNome: z.string().nullable(),
  itens: z.array(baixaItemRespostaSchema),
  createdAt: z.iso.datetime(),
});
export type BaixaInsumo = z.infer<typeof baixaInsumoSchema>;

export const baixaInsumoPageSchema = paginatedResponseSchema(baixaInsumoSchema);
