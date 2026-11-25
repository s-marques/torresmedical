import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { erroObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';
import {
  camposEntradaContaFinanceira,
  camposSaidaContaFinanceira,
  CONTA_FINANCEIRA_VALOR_MAX,
  decimal,
  documentoContaFinanceira,
  filtrosContaFinanceira,
  idOpcional,
  observacoesContaFinanceira,
  statusExibicaoContaFinanceira,
} from './conta-financeira';

/** Checkbox "Funcionário" do modal: desmarcado = Fornecedor (padrão), marcado = Funcionário. */
export const CONTA_PAGAR_BENEFICIARIO_TIPOS = ['FORNECEDOR', 'FUNCIONARIO'] as const;
export const contaPagarBeneficiarioTipoSchema = z.enum(CONTA_PAGAR_BENEFICIARIO_TIPOS, {
  error: 'Tipo de beneficiário inválido',
});
export type ContaPagarBeneficiarioTipo = (typeof CONTA_PAGAR_BENEFICIARIO_TIPOS)[number];

/** Combobox "Status" do modal (mesmo padrão de Contas a Receber): Pendente / Pago / Cancelado. */
export const CONTA_PAGAR_STATUS = ['PENDENTE', 'PAGO', 'CANCELADO'] as const;
export const contaPagarStatusSchema = z.enum(CONTA_PAGAR_STATUS, { error: 'Status inválido' });
export type ContaPagarStatus = (typeof CONTA_PAGAR_STATUS)[number];

export const CONTA_PAGAR_ROTULO_STATUS: Readonly<Record<ContaPagarStatus, string>> = {
  PENDENTE: 'Pendente',
  PAGO: 'Pago',
  CANCELADO: 'Cancelado',
};

/**
 * Chips do grid (inventário): Todos (ausente) / Pendente / Pago / Vencido. "Vencido" não é
 * gravado: é calculado (PENDENTE com `dataVencimento` no passado).
 */
export const CONTA_PAGAR_FILTRO_STATUS = ['PENDENTE', 'PAGO', 'VENCIDO'] as const;
export const contaPagarFiltroStatusSchema = z.enum(CONTA_PAGAR_FILTRO_STATUS, {
  error: 'Status inválido',
});
export type ContaPagarFiltroStatus = (typeof CONTA_PAGAR_FILTRO_STATUS)[number];

export const CONTA_PAGAR_ROTULO_FILTRO_STATUS: Readonly<Record<ContaPagarFiltroStatus, string>> = {
  PENDENTE: 'Pendente',
  PAGO: 'Pago',
  VENCIDO: 'Vencido',
};

/** Status gravado, mais "Vencido" calculado: o que a coluna "Status" do grid exibe. */
export type ContaPagarStatusExibicao = ContaPagarStatus | 'VENCIDO';

export const CONTA_PAGAR_ROTULO_STATUS_EXIBICAO: Readonly<
  Record<ContaPagarStatusExibicao, string>
> = {
  ...CONTA_PAGAR_ROTULO_STATUS,
  VENCIDO: 'Vencido',
};

/** Status exibido na linha: "Vencido" quando pendente e com vencimento no passado. */
export function statusExibicaoContaPagar(
  conta: Pick<ContaPagar, 'status' | 'dataVencimento'>,
): ContaPagarStatusExibicao {
  return statusExibicaoContaFinanceira(conta);
}

/**
 * Aprovação financeira da conta antes da baixa (issue #164, R §16): Lançada → Aprovada, ou
 * Recusada. Fica à parte de `status` (Pendente/Pago/Cancelado). Só conta Aprovada recebe baixa.
 */
export const CONTA_PAGAR_APROVACOES = ['LANCADA', 'APROVADA', 'RECUSADA'] as const;
export const contaPagarAprovacaoSchema = z.enum(CONTA_PAGAR_APROVACOES, {
  error: 'Situação de aprovação inválida',
});
export type ContaPagarAprovacao = (typeof CONTA_PAGAR_APROVACOES)[number];

export const CONTA_PAGAR_ROTULO_APROVACAO: Readonly<Record<ContaPagarAprovacao, string>> = {
  LANCADA: 'Aguardando aprovação',
  APROVADA: 'Aprovada',
  RECUSADA: 'Recusada',
};

/** Código do 422 da baixa de conta que ainda não foi aprovada. */
export const CONTA_PAGAR_NAO_APROVADA = 'CONTA_PAGAR_NAO_APROVADA';
/** Código do 422 quando quem lançou a conta tenta aprová-la (ou recusá-la). */
export const CONTA_PAGAR_APROVADOR_IGUAL_LANCADOR = 'CONTA_PAGAR_APROVADOR_IGUAL_LANCADOR';
/** Código do 422 de aprovar ou recusar conta que não está aguardando aprovação. */
export const CONTA_PAGAR_APROVACAO_INVALIDA = 'CONTA_PAGAR_APROVACAO_INVALIDA';

export const CONTA_PAGAR_MOTIVO_RECUSA_MAX = 500;

/** `POST /api/financeiro/contas-pagar/:id/recusar`: o motivo é obrigatório. */
export const recusarContaPagarSchema = z.strictObject({
  motivo: z
    .string({ error: erroObrigatorio('Motivo') })
    .trim()
    .min(1, { error: erroObrigatorio('Motivo') })
    .max(CONTA_PAGAR_MOTIVO_RECUSA_MAX, {
      error: () =>
        traduzirValidacao('validacao.campoMax', {
          campo: 'Motivo',
          count: CONTA_PAGAR_MOTIVO_RECUSA_MAX,
        }),
    }),
});
export type RecusarContaPagarInput = z.output<typeof recusarContaPagarSchema>;
export type RecusarContaPagarFormulario = z.input<typeof recusarContaPagarSchema>;

/** Competência contábil: mês/ano (`AAAA-MM`). Opcional; vazio vira `null`. */
export const competenciaOpcional = z
  .string({ error: () => traduzirValidacao('validacao.formatoInvalido') })
  .trim()
  .nullish()
  .transform((valor) => valor || null)
  .refine((valor) => valor === null || /^\d{4}-(0[1-9]|1[0-2])$/.test(valor), {
    error: () => traduzirValidacao('validacao.formatoInvalido'),
  });

/**
 * `POST`/`PATCH /api/financeiro/contas-pagar` (modais "Nova Conta a Pagar" e "Editar Conta a
 * Pagar"). `beneficiarioId` é o fornecedor ou o funcionário, conforme `beneficiarioTipo` (o
 * checkbox "Funcionário" do modal); ambos opcionais, como o Cliente em Contas a Receber.
 */
export const contaPagarInputSchema = z.strictObject({
  ...camposEntradaContaFinanceira,
  beneficiarioTipo: contaPagarBeneficiarioTipoSchema.default('FORNECEDOR'),
  beneficiarioId: idOpcional('Beneficiário'),
  status: contaPagarStatusSchema.default('PENDENTE'),
  competencia: competenciaOpcional,
  centroCustoId: idOpcional('Centro de custo'),
  /** Arquivo do boleto, fatura ou NF enviado em `/api/arquivos` (uso `documento-conta-pagar`). */
  documentoArquivoId: idOpcional('Anexo do documento'),
  /**
   * O usuário viu o alerta de possível duplicidade (issue #163) e escolheu continuar. Não é
   * gravado na conta: vira um registro de auditoria.
   */
  duplicidadeConfirmada: z.boolean().optional(),
});

export type ContaPagarFormulario = z.input<typeof contaPagarInputSchema>;
export type CreateContaPagarInput = z.output<typeof contaPagarInputSchema>;
export type UpdateContaPagarInput = CreateContaPagarInput;
export const createContaPagarSchema = contaPagarInputSchema;
export const updateContaPagarSchema = contaPagarInputSchema;

export const CONTA_PAGAR_SORT_FIELDS = [
  'id',
  'descricao',
  'beneficiario',
  'valor',
  'dataVencimento',
  'status',
] as const;

/** `GET /api/financeiro/contas-pagar`. */
export const listContasPagarQuerySchema = listQuerySchema({
  sortFields: CONTA_PAGAR_SORT_FIELDS,
  defaultSort: 'dataVencimento:asc',
  filters: {
    ...filtrosContaFinanceira(contaPagarFiltroStatusSchema),
    aprovacao: contaPagarAprovacaoSchema.optional(),
  },
});
export type ListContasPagarQuery = z.infer<typeof listContasPagarQuerySchema>;

export const CONTA_PAGAR_EXPORT_COLUMNS = [
  'id',
  'descricao',
  'beneficiario',
  'valor',
  'dataVencimento',
  'status',
] as const;
export type ContaPagarExportColumn = (typeof CONTA_PAGAR_EXPORT_COLUMNS)[number];

/** `GET /api/financeiro/contas-pagar/export`. */
export const exportContasPagarQuerySchema = exportQuerySchema(
  listContasPagarQuerySchema,
  CONTA_PAGAR_EXPORT_COLUMNS,
);
export type ExportContasPagarQuery = z.infer<typeof exportContasPagarQuerySchema>;

export const contaPagarSchema = z.object({
  ...camposSaidaContaFinanceira,
  beneficiarioTipo: contaPagarBeneficiarioTipoSchema,
  beneficiarioId: z.uuid().nullable(),
  beneficiarioNome: z.string().nullable(),
  status: contaPagarStatusSchema,
  aprovacao: contaPagarAprovacaoSchema,
  /** Quem aprovou (nome) e quando; `null` enquanto não aprovada. */
  aprovadoPorNome: z.string().nullable(),
  aprovadoEm: z.iso.datetime().nullable(),
  recusadoPorNome: z.string().nullable(),
  recusadoEm: z.iso.datetime().nullable(),
  motivoRecusa: z.string().nullable(),
  /** Soma das baixas não canceladas. */
  valorPago: decimal,
  /** Competência contábil (`AAAA-MM`). */
  competencia: z.string().nullable(),
  centroCustoId: z.uuid().nullable(),
  centroCustoNome: z.string().nullable(),
  /** Arquivo do boleto, fatura ou NF (link em `/api/arquivos/:id/link`). */
  documentoArquivoId: z.uuid().nullable(),
});
export type ContaPagar = z.infer<typeof contaPagarSchema>;

export const contaPagarPageSchema = paginatedResponseSchema(contaPagarSchema);
export type ContaPagarPage = z.infer<typeof contaPagarPageSchema>;

// --- Baixa (modal "Baixar Conta a Pagar") ---

const valorPago = z
  .number({ error: erroObrigatorio('Valor pago') })
  .positive({ error: 'O valor pago deve ser maior que zero' })
  .max(CONTA_FINANCEIRA_VALOR_MAX, { error: 'Valor inválido' });

const dataPagamento = z
  .string({ error: erroObrigatorio('Data de pagamento', 'f') })
  .min(1, { error: erroObrigatorio('Data de pagamento', 'f') })
  .pipe(z.iso.date({ error: 'Data de pagamento inválida' }));

const valorAdicional = (rotulo: string) =>
  z
    .number({ error: `${rotulo} inválido` })
    .min(0, { error: `${rotulo} não pode ser negativo` })
    .max(CONTA_FINANCEIRA_VALOR_MAX, { error: `${rotulo} inválido` })
    .default(0);

export const CONTA_PAGAR_JUSTIFICATIVA_MAX = 500;

const justificativaDivergenciaOpcional = z
  .string({ error: 'Justificativa inválida' })
  .trim()
  .max(CONTA_PAGAR_JUSTIFICATIVA_MAX, {
    error: () =>
      traduzirValidacao('validacao.campoMax', {
        campo: 'Justificativa',
        count: CONTA_PAGAR_JUSTIFICATIVA_MAX,
      }),
  })
  .nullish()
  .transform((valor) => valor || null);

/**
 * `POST /api/financeiro/contas-pagar/:id/baixar` (modal "Baixar Conta a Pagar"). O checkbox
 * "Pagamento parcial" só controla se `valorPago` fica editável no front: a API sempre aceita o
 * valor informado e soma às baixas anteriores para saber se a conta ficou quitada.
 */
export const baixarContaPagarSchema = z.strictObject({
  dataPagamento,
  valorPago,
  juros: valorAdicional('Juros'),
  desconto: valorAdicional('Desconto'),
  formaPagamentoId: idOpcional('Forma de pagamento'),
  contaBancariaId: idOpcional('Conta bancária'),
  documento: documentoContaFinanceira,
  observacoes: observacoesContaFinanceira,
  comprovanteArquivoId: idOpcional('Comprovante'),
  /**
   * Obrigatória quando o valor pago difere do saldo do título: o service recusa a baixa sem ela
   * (issue #163).
   */
  justificativaDivergencia: justificativaDivergenciaOpcional,
  /**
   * Marcado no checkbox "Pagamento parcial": pagar menos que o saldo é intencional e não conta
   * como divergência. Não é gravado na baixa.
   */
  pagamentoParcial: z.boolean().default(false),
});
export type BaixarContaPagarFormulario = z.input<typeof baixarContaPagarSchema>;
export type BaixarContaPagarInput = z.output<typeof baixarContaPagarSchema>;

export const contaPagarBaixaSchema = z.object({
  id: z.uuid(),
  contaPagarId: z.uuid(),
  dataPagamento: z.iso.date(),
  valorPago: decimal,
  juros: decimal,
  desconto: decimal,
  formaPagamentoId: z.uuid().nullable(),
  formaPagamentoNome: z.string().nullable(),
  contaBancariaId: z.uuid().nullable(),
  contaBancariaNome: z.string().nullable(),
  documento: z.string().nullable(),
  observacoes: z.string().nullable(),
  comprovanteArquivoId: z.uuid().nullable(),
  /** Valor pago menos o saldo do título; `null` quando não houve divergência. */
  divergencia: decimal.nullable(),
  justificativaDivergencia: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ContaPagarBaixa = z.infer<typeof contaPagarBaixaSchema>;

// --- Duplicidade (issue #163) ---

/** Por que um título existente parece o mesmo que está sendo lançado. */
export const CONTA_PAGAR_DUPLICIDADE_MOTIVOS = ['MESMO_TITULO', 'MESMO_DOCUMENTO'] as const;
export const contaPagarDuplicidadeMotivoSchema = z.enum(CONTA_PAGAR_DUPLICIDADE_MOTIVOS);
export type ContaPagarDuplicidadeMotivo = z.infer<typeof contaPagarDuplicidadeMotivoSchema>;

export const CONTA_PAGAR_DUPLICIDADE_MOTIVO_ROTULOS: Readonly<
  Record<ContaPagarDuplicidadeMotivo, string>
> = {
  MESMO_TITULO: 'Mesmo fornecedor, valor e vencimento',
  MESMO_DOCUMENTO: 'Mesmo número de documento',
};

/** Código do 409 de `POST`/`PATCH` quando há possível duplicidade e o envio não foi confirmado. */
export const CONTA_PAGAR_POSSIVEL_DUPLICADA = 'CONTA_PAGAR_POSSIVEL_DUPLICADA';
/** Código do 422 da baixa com valor diferente do saldo do título e sem justificativa. */
export const CONTA_PAGAR_BAIXA_DIVERGENTE = 'CONTA_PAGAR_BAIXA_DIVERGENTE';

/**
 * Corpo de `POST /api/financeiro/contas-pagar/duplicidade`: os campos que identificam o título.
 * Com `contaPagarId` (edição) a própria conta fica de fora.
 */
export const verificarDuplicidadeContaPagarSchema = z.strictObject({
  contaPagarId: z.uuid().nullish(),
  beneficiarioTipo: contaPagarBeneficiarioTipoSchema.default('FORNECEDOR'),
  beneficiarioId: idOpcional('Beneficiário'),
  valor: z.number().positive().max(CONTA_FINANCEIRA_VALOR_MAX).nullish(),
  dataVencimento: z
    .union([z.literal(''), z.iso.date()])
    .nullish()
    .transform((valor) => valor || null),
  documento: documentoContaFinanceira,
});
export type VerificarDuplicidadeContaPagarInput = z.input<
  typeof verificarDuplicidadeContaPagarSchema
>;
export type VerificarDuplicidadeContaPagar = z.output<typeof verificarDuplicidadeContaPagarSchema>;

export const contaPagarPossivelDuplicadaSchema = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  descricao: z.string(),
  beneficiarioNome: z.string().nullable(),
  valor: decimal,
  dataVencimento: z.iso.date(),
  documento: z.string().nullable(),
  status: contaPagarStatusSchema,
  motivos: z.array(contaPagarDuplicidadeMotivoSchema).min(1),
});
export type ContaPagarPossivelDuplicada = z.infer<typeof contaPagarPossivelDuplicadaSchema>;

export const verificacaoDuplicidadeContaPagarSchema = z.object({
  candidatos: z.array(contaPagarPossivelDuplicadaSchema),
});
export type VerificacaoDuplicidadeContaPagar = z.infer<
  typeof verificacaoDuplicidadeContaPagarSchema
>;

// --- Relatório de divergências (issue #163) ---

export const CONTA_PAGAR_DIVERGENCIA_SORT_FIELDS = [
  'dataPagamento',
  'divergencia',
  'valorPago',
] as const;

/** `GET /api/financeiro/contas-pagar/divergencias`: baixas com valor diferente do saldo do título. */
export const listDivergenciasContaPagarQuerySchema = listQuerySchema({
  sortFields: CONTA_PAGAR_DIVERGENCIA_SORT_FIELDS,
  defaultSort: 'dataPagamento:desc',
  filters: {
    pagamentoDe: z.iso.date({ error: 'Data inválida' }).optional(),
    pagamentoAte: z.iso.date({ error: 'Data inválida' }).optional(),
  },
});
export type ListDivergenciasContaPagarQuery = z.infer<typeof listDivergenciasContaPagarQuerySchema>;

export const CONTA_PAGAR_DIVERGENCIA_EXPORT_COLUMNS = [
  'numero',
  'descricao',
  'beneficiario',
  'valor',
  'valorPago',
  'divergencia',
  'justificativa',
  'dataPagamento',
] as const;
export type ContaPagarDivergenciaExportColumn =
  (typeof CONTA_PAGAR_DIVERGENCIA_EXPORT_COLUMNS)[number];

/** `GET /api/financeiro/contas-pagar/divergencias/export`. */
export const exportDivergenciasContaPagarQuerySchema = exportQuerySchema(
  listDivergenciasContaPagarQuerySchema,
  CONTA_PAGAR_DIVERGENCIA_EXPORT_COLUMNS,
);
export type ExportDivergenciasContaPagarQuery = z.infer<
  typeof exportDivergenciasContaPagarQuerySchema
>;

export const contaPagarDivergenciaSchema = z.object({
  baixaId: z.uuid(),
  contaPagarId: z.uuid(),
  numero: z.number().int(),
  descricao: z.string(),
  beneficiarioNome: z.string().nullable(),
  /** Valor do título. */
  valor: decimal,
  valorPago: decimal,
  /** Valor pago menos o saldo do título: positivo é a mais; negativo, a menos. */
  divergencia: decimal,
  justificativa: z.string().nullable(),
  dataPagamento: z.iso.date(),
});
export type ContaPagarDivergencia = z.infer<typeof contaPagarDivergenciaSchema>;

export const contaPagarDivergenciaPageSchema = paginatedResponseSchema(contaPagarDivergenciaSchema);
export type ContaPagarDivergenciaPage = z.infer<typeof contaPagarDivergenciaPageSchema>;
