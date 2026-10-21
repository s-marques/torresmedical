import { z } from 'zod';
import { ativoStatusSchema, exportQuerySchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';
import { FINALIDADES_PAGAMENTO } from '../lookups/lookup';

export const FORMA_PAGAMENTO_NOME_MAX = 120;
export const FORMA_PAGAMENTO_PRAZO_MAX = 365;
export const FORMA_PAGAMENTO_PARCELAS_MAX = 60;

/** Tipos do combo do modal. Na entrada e nos filtros são minúsculos; a resposta usa o valor do banco. */
export const FORMA_PAGAMENTO_TIPOS = [
  'dinheiro',
  'pix',
  'boleto',
  'cartao_credito',
  'cartao_debito',
  'convenio',
  'cortesia',
  'permuta',
  'pagamento',
] as const;

export type FormaPagamentoTipo = (typeof FORMA_PAGAMENTO_TIPOS)[number];

const nome = z
  .string({ error: 'Nome é obrigatório.' })
  .trim()
  .min(1, { error: 'Nome é obrigatório.' })
  .max(FORMA_PAGAMENTO_NOME_MAX, {
    error: `O nome deve ter no máximo ${FORMA_PAGAMENTO_NOME_MAX} caracteres`,
  });

const finalidade = z.enum(FINALIDADES_PAGAMENTO, { error: 'Finalidade deve ser receber ou pagar' });

const tipo = z.enum(FORMA_PAGAMENTO_TIPOS, { error: 'Tipo inválido' });

const prazoRecebimentoDias = z
  .number({ error: 'Informe o prazo de recebimento em dias' })
  .int({ error: 'O prazo deve ser um número inteiro de dias' })
  .min(0, { error: 'O prazo não pode ser negativo' })
  .max(FORMA_PAGAMENTO_PRAZO_MAX, {
    error: `O prazo deve ser de no máximo ${FORMA_PAGAMENTO_PRAZO_MAX} dias`,
  });

const maxParcelas = z
  .number({ error: 'Informe o máximo de parcelas' })
  .int({ error: 'O máximo de parcelas deve ser um número inteiro' })
  .min(1, { error: 'O máximo de parcelas deve ser de pelo menos 1' })
  .max(FORMA_PAGAMENTO_PARCELAS_MAX, {
    error: `O máximo de parcelas deve ser de no máximo ${FORMA_PAGAMENTO_PARCELAS_MAX}`,
  });

const movimentaContaBancaria = z.boolean({ error: 'Valor inválido' });

/** `POST /api/financeiro/formas-pagamento`. Só o nome é obrigatório; o resto tem o padrão do modal. */
export const createFormaPagamentoSchema = z.strictObject({
  nome,
  finalidade: finalidade.default('receber'),
  tipo: tipo.default('dinheiro'),
  prazoRecebimentoDias: prazoRecebimentoDias.default(0),
  maxParcelas: maxParcelas.default(1),
  movimentaContaBancaria: movimentaContaBancaria.default(true),
});

export type CreateFormaPagamentoInput = z.infer<typeof createFormaPagamentoSchema>;
export type FormaPagamentoFormulario = z.input<typeof createFormaPagamentoSchema>;

/** `PATCH /api/financeiro/formas-pagamento/:id`. `ativo` é o botão Ativar/Desativar da linha. */
export const updateFormaPagamentoSchema = z
  .strictObject({
    nome: nome.optional(),
    finalidade: finalidade.optional(),
    tipo: tipo.optional(),
    prazoRecebimentoDias: prazoRecebimentoDias.optional(),
    maxParcelas: maxParcelas.optional(),
    movimentaContaBancaria: movimentaContaBancaria.optional(),
    ativo: z.boolean({ error: 'Valor inválido' }).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Informe ao menos um campo para alterar',
  });

export type UpdateFormaPagamentoInput = z.infer<typeof updateFormaPagamentoSchema>;

export const FORMA_PAGAMENTO_SORT_FIELDS = [
  'nome',
  'tipo',
  'prazoRecebimentoDias',
  'maxParcelas',
  'ativo',
] as const;

/** `GET /api/financeiro/formas-pagamento`. */
export const listFormasPagamentoQuerySchema = listQuerySchema({
  sortFields: FORMA_PAGAMENTO_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {
    status: ativoStatusSchema.optional(),
    finalidade: finalidade.optional(),
    tipo: tipo.optional(),
  },
});

export type ListFormasPagamentoQuery = z.infer<typeof listFormasPagamentoQuerySchema>;

export const FORMA_PAGAMENTO_EXPORT_COLUMNS = [
  'nome',
  'finalidade',
  'tipo',
  'prazoRecebimentoDias',
  'maxParcelas',
  'ativo',
] as const;
export type FormaPagamentoExportColumn = (typeof FORMA_PAGAMENTO_EXPORT_COLUMNS)[number];

/** `GET /api/financeiro/formas-pagamento/export`. */
export const exportFormasPagamentoQuerySchema = exportQuerySchema(
  listFormasPagamentoQuerySchema,
  FORMA_PAGAMENTO_EXPORT_COLUMNS,
);

export type ExportFormasPagamentoQuery = z.infer<typeof exportFormasPagamentoQuerySchema>;

export const formaPagamentoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  /** Valores do banco (iguais ao `audit_log`). */
  finalidade: z.enum(['RECEBER', 'PAGAR']),
  tipo: z.enum([
    'DINHEIRO',
    'PIX',
    'BOLETO',
    'CARTAO_CREDITO',
    'CARTAO_DEBITO',
    'CONVENIO',
    'CORTESIA',
    'PERMUTA',
    'PAGAMENTO',
  ]),
  prazoRecebimentoDias: z.number().int(),
  maxParcelas: z.number().int(),
  movimentaContaBancaria: z.boolean(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type FormaPagamento = z.infer<typeof formaPagamentoSchema>;

export const formaPagamentoPageSchema = paginatedResponseSchema(formaPagamentoSchema);

export type FormaPagamentoPage = z.infer<typeof formaPagamentoPageSchema>;

/** Rótulos do grid e da exportação (valor do banco → texto). */
export const FORMA_PAGAMENTO_ROTULO_TIPO: Readonly<Record<FormaPagamento['tipo'], string>> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  BOLETO: 'Boleto',
  CARTAO_CREDITO: 'Cartão de Crédito',
  CARTAO_DEBITO: 'Cartão de Débito',
  CONVENIO: 'Convênio',
  CORTESIA: 'Cortesia',
  PERMUTA: 'Permuta',
  PAGAMENTO: 'Pagamento',
};

/** Coluna Finalidade do grid. No combo do modal os textos são "Vendas / Recebimento" e "Compras / Pagamento". */
export const FORMA_PAGAMENTO_ROTULO_FINALIDADE: Readonly<
  Record<FormaPagamento['finalidade'], string>
> = {
  RECEBER: 'Receber',
  PAGAR: 'Pagar',
};
