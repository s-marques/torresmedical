import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { erroObrigatorio, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const PROTOCOLO_NOME_MAX = 150;
export const PROTOCOLO_CATEGORIA_MAX = 60;
export const PROTOCOLO_CATEGORIA_PADRAO = 'Geral';
export const PROTOCOLO_OBSERVACOES_MAX = 2000;
export const PROTOCOLO_SEMANAS_MAX = 520;
export const PROTOCOLO_ITENS_MAX = 100;
export const PROTOCOLO_QUANTIDADE_MAX = 999;
export const PROTOCOLO_VALOR_MAX = 9_999_999.99;

/** Opções do select "Tipo" do modal. Só "Procedimento" aparece nos prints. */
export const PROTOCOLO_TIPOS = ['procedimento', 'produto'] as const;
export type ProtocoloTipo = (typeof PROTOCOLO_TIPOS)[number];
export const PROTOCOLO_TIPO_ROTULOS: Readonly<Record<ProtocoloTipo, string>> = {
  procedimento: 'Procedimento',
  produto: 'Produto',
};

/** Mensagem do 409 quando já existe protocolo (ou protocolo mãe) com o nome. */
export const PROTOCOLO_NOME_DUPLICADO = 'Já existe um protocolo com este nome.';
export const PROTOCOLO_MAE_NOME_DUPLICADO = 'Já existe um protocolo mãe com este nome.';

/** Categoria vazia vira "Geral" (padrão do modal). */
export const categoriaProtocoloSchema = z
  .string({ error: 'Categoria inválida' })
  .trim()
  .max(PROTOCOLO_CATEGORIA_MAX, {
    error: `Categoria deve ter no máximo ${PROTOCOLO_CATEGORIA_MAX} caracteres`,
  })
  .nullish()
  .transform((valor) => valor || PROTOCOLO_CATEGORIA_PADRAO);

export const valorProtocoloSchema = z
  .number({ error: 'Valor inválido' })
  .min(0, { error: 'O valor não pode ser negativo' })
  .max(PROTOCOLO_VALOR_MAX, { error: 'Valor inválido' })
  .default(0);

export const totalSemanasSchema = z
  .number({ error: 'Informe o total de semanas' })
  .int({ error: 'O total de semanas deve ser um número inteiro' })
  .min(1, { error: 'O total de semanas deve ser de pelo menos 1' })
  .max(PROTOCOLO_SEMANAS_MAX, {
    error: `O total de semanas deve ser de no máximo ${PROTOCOLO_SEMANAS_MAX}`,
  })
  .default(1);

export const textoLongoProtocoloSchema = (rotulo: string) =>
  z
    .string({ error: `${rotulo} inválida` })
    .trim()
    .max(PROTOCOLO_OBSERVACOES_MAX, {
      error: `${rotulo} deve ter no máximo ${PROTOCOLO_OBSERVACOES_MAX} caracteres`,
    })
    .nullish()
    .transform((valor) => valor || null);

/** Linha da tabela "Itens do Protocolo (composição)". */
export const protocoloItemInputSchema = z.strictObject({
  produtoId: z.uuid({ error: erroObrigatorio('Produto/Serviço') }),
  quantidade: z
    .number({ error: 'Informe a quantidade' })
    .int({ error: 'A quantidade deve ser um número inteiro' })
    .min(1, { error: 'A quantidade deve ser de pelo menos 1' })
    .max(PROTOCOLO_QUANTIDADE_MAX, {
      error: `A quantidade deve ser de no máximo ${PROTOCOLO_QUANTIDADE_MAX}`,
    }),
});
export type ProtocoloItemInput = z.infer<typeof protocoloItemInputSchema>;

/**
 * Corpo de `POST` e `PATCH /api/gestao-profissionais/protocolos` (modais "Novo Protocolo" e
 * "Editar Protocolo"). O `PATCH` substitui os campos do formulário. Só o nome é obrigatório; o
 * nome não pode repetir (verificado no service).
 */
export const protocoloInputSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: PROTOCOLO_NOME_MAX }),
  tipo: z.enum(PROTOCOLO_TIPOS, { error: 'Tipo inválido' }).default('procedimento'),
  categoria: categoriaProtocoloSchema,
  profissionalId: z
    .uuid({ error: 'Profissional inválido' })
    .nullish()
    .transform((valor) => valor ?? null),
  totalSemanas: totalSemanasSchema,
  valorTotal: valorProtocoloSchema,
  observacoes: textoLongoProtocoloSchema('Observação'),
  itens: z
    .array(protocoloItemInputSchema)
    .max(PROTOCOLO_ITENS_MAX, { error: `Informe no máximo ${PROTOCOLO_ITENS_MAX} itens` })
    .refine((itens) => new Set(itens.map((item) => item.produtoId)).size === itens.length, {
      error: 'Há produtos/serviços repetidos na composição',
    })
    .default([]),
});

export type ProtocoloFormulario = z.input<typeof protocoloInputSchema>;
export type CreateProtocoloInput = z.output<typeof protocoloInputSchema>;
export type UpdateProtocoloInput = CreateProtocoloInput;
export const createProtocoloSchema = protocoloInputSchema;
export const updateProtocoloSchema = protocoloInputSchema;

export const PROTOCOLO_SORT_FIELDS = ['nome', 'valorTotal', 'totalSemanas'] as const;

/** `GET /api/gestao-profissionais/protocolos`: agrupada por categoria, depois pelo `sort`. */
export const listProtocolosQuerySchema = listQuerySchema({
  sortFields: PROTOCOLO_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {
    categoria: z
      .string()
      .trim()
      .max(PROTOCOLO_CATEGORIA_MAX)
      .optional()
      .transform((valor) => valor || undefined),
    profissionalId: z.uuid({ error: 'Profissional inválido' }).optional(),
  },
});
export type ListProtocolosQuery = z.infer<typeof listProtocolosQuerySchema>;

export const protocoloItemSchema = z.object({
  produtoId: z.uuid(),
  produtoNome: z.string(),
  quantidade: z.number().int(),
});
export type ProtocoloItem = z.infer<typeof protocoloItemSchema>;

export const protocoloSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  tipo: z.enum(PROTOCOLO_TIPOS),
  categoria: z.string(),
  profissionalId: z.uuid().nullable(),
  profissionalNome: z.string().nullable(),
  totalSemanas: z.number().int(),
  valorTotal: z.number(),
  /** Soma das quantidades dos itens, no mínimo 1 (detalhe "Sessões"). */
  sessoes: z.number().int(),
  observacoes: z.string().nullable(),
  itens: z.array(protocoloItemSchema),
  /** Usado em semana de protocolo mãe: não pode ser excluído. */
  emUso: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Protocolo = z.infer<typeof protocoloSchema>;

export const protocoloPageSchema = paginatedResponseSchema(protocoloSchema);
export type ProtocoloPage = z.infer<typeof protocoloPageSchema>;

/** `GET /api/gestao-profissionais/protocolos/categorias`: opções do filtro "Categoria". */
export const protocoloCategoriasSchema = z.object({ data: z.array(z.string()) });
export type ProtocoloCategorias = z.infer<typeof protocoloCategoriasSchema>;

/** Valor por semana exibido no card: valor total ÷ semanas. */
export function valorPorSemana(valorTotal: number, totalSemanas: number): number {
  return Math.round((valorTotal / Math.max(totalSemanas, 1)) * 100) / 100;
}

/** "Sessões" do detalhe: soma das quantidades dos itens, no mínimo 1. */
export function sessoesDoProtocolo(itens: readonly { quantidade: number }[]): number {
  return Math.max(
    1,
    itens.reduce((soma, item) => soma + item.quantidade, 0),
  );
}
