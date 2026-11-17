import { z } from 'zod';
import { exportQuerySchema, listQuerySchema, searchSchema } from '../common/list-query';
import { paginatedResponseSchema, paginationQuerySchema } from '../common/pagination';

export const ORCAMENTO_OBSERVACOES_MAX = 2000;
export const ORCAMENTO_DESCRICAO_MAX = 200;
export const ORCAMENTO_ITENS_MAX = 100;
export const ORCAMENTO_QUANTIDADE_MAX = 9999;
/** Cabe em DECIMAL(12,2). */
export const ORCAMENTO_VALOR_MAX = 999_999_999;

export const MSG_ORCAMENTO_SEM_ITENS = 'Adicione ao menos um item.';

/** Chips do grid: Todos (ausente) / Pendente / Aprovado / Concluído / Cancelado. */
export const ORCAMENTO_STATUS_FILTRO = ['pendente', 'aprovado', 'concluido', 'cancelado'] as const;
export const orcamentoStatusFiltroSchema = z.enum(ORCAMENTO_STATUS_FILTRO, {
  error: 'Status inválido',
});
export type OrcamentoStatusFiltro = z.infer<typeof orcamentoStatusFiltroSchema>;

/** Valor do banco (igual ao `audit_log`). */
export const ORCAMENTO_STATUS = ['PENDENTE', 'APROVADO', 'CONCLUIDO', 'CANCELADO'] as const;
export type OrcamentoStatus = (typeof ORCAMENTO_STATUS)[number];

export const ORCAMENTO_ROTULO_STATUS: Readonly<Record<OrcamentoStatus, string>> = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

/** Abas do modal "Novo Orçamento": Serviços / Protocolos / Protocolos Mãe. */
export const ORCAMENTO_ORIGENS = ['servico', 'protocolo', 'protocolo-mae'] as const;
export const orcamentoOrigemSchema = z.enum(ORCAMENTO_ORIGENS, { error: 'Origem inválida' });
export type OrcamentoOrigem = z.infer<typeof orcamentoOrigemSchema>;

/** Seletor `R$` / `%` do desconto geral. */
export const ORCAMENTO_DESCONTO_TIPOS = ['valor', 'percentual'] as const;
export const orcamentoDescontoTipoSchema = z.enum(ORCAMENTO_DESCONTO_TIPOS, {
  error: 'Tipo de desconto inválido',
});
export type OrcamentoDescontoTipo = z.infer<typeof orcamentoDescontoTipoSchema>;

const dinheiro = (mensagem: string) =>
  z
    .number({ error: mensagem })
    .min(0, { error: mensagem })
    .max(ORCAMENTO_VALOR_MAX, { error: 'Valor muito alto' });

export const orcamentoItemInputSchema = z
  .strictObject({
    origem: orcamentoOrigemSchema,
    /** Serviço, protocolo ou protocolo mãe de onde o item veio. */
    origemId: z.uuid({ error: 'Item inválido' }),
    descricao: z
      .string({ error: 'Informe a descrição do item' })
      .trim()
      .min(1, { error: 'Informe a descrição do item' })
      .max(ORCAMENTO_DESCRICAO_MAX, {
        error: `A descrição deve ter no máximo ${ORCAMENTO_DESCRICAO_MAX} caracteres`,
      }),
    quantidade: z
      .number({ error: 'Informe a quantidade' })
      .int({ error: 'A quantidade deve ser um número inteiro' })
      .min(1, { error: 'A quantidade deve ser de pelo menos 1' })
      .max(ORCAMENTO_QUANTIDADE_MAX, {
        error: `A quantidade deve ser de no máximo ${ORCAMENTO_QUANTIDADE_MAX}`,
      }),
    valorUnitario: dinheiro('Informe um valor válido'),
    /** Desconto do item em R$. */
    desconto: dinheiro('Informe um desconto válido').default(0),
  })
  .refine((item) => item.desconto <= item.quantidade * item.valorUnitario, {
    error: 'O desconto não pode ser maior que o valor do item',
    path: ['desconto'],
  });

export type OrcamentoItemInput = z.output<typeof orcamentoItemInputSchema>;

/**
 * `POST /api/comercial-atendimento/orcamentos`: modal "Novo Orçamento". Cliente e forma de
 * pagamento são opcionais ("Não definida"). Os totais são calculados no servidor.
 */
export const criarOrcamentoSchema = z
  .strictObject({
    pacienteId: z
      .uuid({ error: 'Cliente inválido' })
      .nullish()
      .transform((valor) => valor ?? null),
    formaPagamentoId: z
      .uuid({ error: 'Forma de pagamento inválida' })
      .nullish()
      .transform((valor) => valor ?? null),
    observacoes: z
      .string()
      .trim()
      .max(ORCAMENTO_OBSERVACOES_MAX, {
        error: `As observações devem ter no máximo ${ORCAMENTO_OBSERVACOES_MAX} caracteres`,
      })
      .nullish()
      .transform((valor) => valor || null),
    descontoTipo: orcamentoDescontoTipoSchema.default('valor'),
    descontoValor: dinheiro('Informe um desconto válido').default(0),
    itens: z
      .array(orcamentoItemInputSchema, { error: MSG_ORCAMENTO_SEM_ITENS })
      .min(1, { error: MSG_ORCAMENTO_SEM_ITENS })
      .max(ORCAMENTO_ITENS_MAX, { error: `Informe no máximo ${ORCAMENTO_ITENS_MAX} itens` }),
  })
  .refine((o) => o.descontoTipo !== 'percentual' || o.descontoValor <= 100, {
    error: 'O desconto percentual não pode passar de 100%',
    path: ['descontoValor'],
  });

export type CriarOrcamentoInput = z.output<typeof criarOrcamentoSchema>;
export type CriarOrcamentoFormulario = z.input<typeof criarOrcamentoSchema>;

export interface TotaisOrcamento {
  /** Total de cada item, na ordem recebida. */
  totaisItens: number[];
  subtotal: number;
  /** Desconto geral já convertido para R$ e limitado ao subtotal. */
  descontoGeral: number;
  total: number;
}

const arredondar = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

/** Cálculo único usado pelo modal (prévia) e pela API (valor gravado). */
export function calcularTotaisOrcamento(
  itens: readonly Pick<OrcamentoItemInput, 'quantidade' | 'valorUnitario' | 'desconto'>[],
  descontoTipo: OrcamentoDescontoTipo,
  descontoValor: number,
): TotaisOrcamento {
  const totaisItens = itens.map((i) =>
    Math.max(0, arredondar(i.quantidade * i.valorUnitario - i.desconto)),
  );
  const subtotal = arredondar(totaisItens.reduce((soma, t) => soma + t, 0));
  const bruto = descontoTipo === 'percentual' ? (subtotal * descontoValor) / 100 : descontoValor;
  const descontoGeral = arredondar(Math.min(Math.max(bruto, 0), subtotal));
  return { totaisItens, subtotal, descontoGeral, total: arredondar(subtotal - descontoGeral) };
}

export const ORCAMENTO_SORT_FIELDS = ['id', 'data', 'cliente', 'total', 'status'] as const;

/** `GET /api/comercial-atendimento/orcamentos`. */
export const listOrcamentosQuerySchema = listQuerySchema({
  sortFields: ORCAMENTO_SORT_FIELDS,
  defaultSort: 'data:desc',
  filters: {
    status: orcamentoStatusFiltroSchema.optional(),
    /** Orçamentos de um paciente (aba Orçamento do Atendimento Médico, #38). */
    pacienteId: z.uuid({ error: 'Paciente inválido' }).optional(),
  },
});
export type ListOrcamentosQuery = z.infer<typeof listOrcamentosQuerySchema>;

export const ORCAMENTO_EXPORT_COLUMNS = ORCAMENTO_SORT_FIELDS;
export type OrcamentoExportColumn = (typeof ORCAMENTO_EXPORT_COLUMNS)[number];

/** `GET /api/comercial-atendimento/orcamentos/export`. */
export const exportOrcamentosQuerySchema = exportQuerySchema(
  listOrcamentosQuerySchema,
  ORCAMENTO_EXPORT_COLUMNS,
);
export type ExportOrcamentosQuery = z.infer<typeof exportOrcamentosQuerySchema>;

/** Valores monetários chegam como texto decimal (ex.: `"150.00"`), exatos como no banco. */
const decimal = z.string();

export const orcamentoItemSchema = z.object({
  id: z.uuid(),
  origem: orcamentoOrigemSchema,
  origemId: z.uuid(),
  descricao: z.string(),
  quantidade: z.number().int(),
  valorUnitario: decimal,
  desconto: decimal,
  total: decimal,
});
export type OrcamentoItem = z.infer<typeof orcamentoItemSchema>;

export const orcamentoSchema = z.object({
  id: z.uuid(),
  /** Número sequencial exibido na coluna "#". */
  numero: z.number().int(),
  /** Coluna "Data". */
  data: z.iso.datetime(),
  pacienteId: z.uuid().nullable(),
  /** Coluna "Cliente". */
  cliente: z.string().nullable(),
  formaPagamentoId: z.uuid().nullable(),
  formaPagamento: z.string().nullable(),
  observacoes: z.string().nullable(),
  descontoTipo: orcamentoDescontoTipoSchema,
  descontoValor: decimal,
  subtotal: decimal,
  total: decimal,
  status: z.enum(ORCAMENTO_STATUS),
  itens: z.array(orcamentoItemSchema),
});
export type Orcamento = z.infer<typeof orcamentoSchema>;

export const orcamentoPageSchema = paginatedResponseSchema(orcamentoSchema);
export type OrcamentoPage = z.infer<typeof orcamentoPageSchema>;

/** `GET /api/comercial-atendimento/orcamentos/catalogo`: itens das abas do modal. */
export const catalogoOrcamentoQuerySchema = paginationQuerySchema.extend({
  tipo: orcamentoOrigemSchema,
  search: searchSchema,
});
export type CatalogoOrcamentoQuery = z.infer<typeof catalogoOrcamentoQuerySchema>;

export const catalogoOrcamentoItemSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  /** Profissional (serviço e protocolo) ou categoria, exibido ao lado do nome. */
  detalhe: z.string().nullable(),
  valor: z.number(),
});
export type CatalogoOrcamentoItem = z.infer<typeof catalogoOrcamentoItemSchema>;

export const catalogoOrcamentoPageSchema = paginatedResponseSchema(catalogoOrcamentoItemSchema);
export type CatalogoOrcamentoPage = z.infer<typeof catalogoOrcamentoPageSchema>;
