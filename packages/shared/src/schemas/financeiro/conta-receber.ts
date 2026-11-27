import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';
import { erroObrigatorio } from '../common/obrigatorio';
import { competenciaOpcional } from './conta-pagar';
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

/**
 * Status gravado (issue #165, requisitos R §17): Pendente (exibido como "A vencer" ou "Vencido"),
 * Recebido (exibido como "Pago"), Parcial, Renegociado e Cancelado. Parcial e Renegociado só
 * nascem das ações "Baixar" e "Renegociar".
 */
export const CONTA_RECEBER_STATUS = [
  'PENDENTE',
  'RECEBIDO',
  'CANCELADO',
  'PARCIAL',
  'RENEGOCIADO',
] as const;
export const contaReceberStatusSchema = z.enum(CONTA_RECEBER_STATUS, { error: 'Status inválido' });
export type ContaReceberStatus = (typeof CONTA_RECEBER_STATUS)[number];

/** Combobox "Status" do modal: só o que o usuário pode escolher (A vencer, Pago e Cancelado). */
export const CONTA_RECEBER_STATUS_MODAL = ['PENDENTE', 'RECEBIDO', 'CANCELADO'] as const;
export const contaReceberStatusModalSchema = z.enum(CONTA_RECEBER_STATUS_MODAL, {
  error: 'Status inválido',
});

/** Rótulo do status gravado (Pendente aparece como "A vencer"; Recebido, como "Pago"). */
export const CONTA_RECEBER_ROTULO_STATUS: Readonly<Record<ContaReceberStatus, string>> = {
  PENDENTE: 'A vencer',
  RECEBIDO: 'Pago',
  CANCELADO: 'Cancelado',
  PARCIAL: 'Parcial',
  RENEGOCIADO: 'Renegociado',
};

/** Status exibido: gravado, com "A vencer" e "Vencido" calculados sobre Pendente. */
export type ContaReceberStatusExibicao =
  Exclude<ContaReceberStatus, 'PENDENTE'> | 'A_VENCER' | 'VENCIDO';

/** Chips do grid: Todos (ausente) e um por status exibido. */
export const CONTA_RECEBER_FILTRO_STATUS = [
  'A_VENCER',
  'VENCIDO',
  'RECEBIDO',
  'PARCIAL',
  'RENEGOCIADO',
  'CANCELADO',
] as const satisfies readonly ContaReceberStatusExibicao[];
export const contaReceberFiltroStatusSchema = z.enum(CONTA_RECEBER_FILTRO_STATUS, {
  error: 'Status inválido',
});
export type ContaReceberFiltroStatus = (typeof CONTA_RECEBER_FILTRO_STATUS)[number];

export const CONTA_RECEBER_ROTULO_STATUS_EXIBICAO: Readonly<
  Record<ContaReceberStatusExibicao, string>
> = {
  A_VENCER: 'A vencer',
  VENCIDO: 'Vencido',
  RECEBIDO: 'Pago',
  PARCIAL: 'Parcial',
  RENEGOCIADO: 'Renegociado',
  CANCELADO: 'Cancelado',
};

export const CONTA_RECEBER_ROTULO_FILTRO_STATUS: Readonly<
  Record<ContaReceberFiltroStatus, string>
> = CONTA_RECEBER_ROTULO_STATUS_EXIBICAO;

/** Status exibido na linha: Pendente vira "Vencido" se o vencimento passou, senão "A vencer". */
export function statusExibicaoContaReceber(
  conta: Pick<ContaReceber, 'status' | 'dataVencimento'>,
): ContaReceberStatusExibicao {
  const status = statusExibicaoContaFinanceira(conta);
  return status === 'PENDENTE' ? 'A_VENCER' : status;
}

/**
 * `POST`/`PATCH /api/financeiro/contas-receber` (modais "Nova Conta a Receber" e "Editar Conta a
 * Receber"). Cliente, Forma de Pagamento, Plano de Contas e Documento são opcionais.
 */
/** Campos do formulário, sem a regra entre eles (a Receita Profissionais parte daqui). */
export const contaReceberCamposSchema = z.strictObject({
  ...camposEntradaContaFinanceira,
  pacienteId: idOpcional('Cliente'),
  /** Sacado profissional (locatário de contrato de sala). Exclusivo com o paciente. */
  profissionalSacadoId: idOpcional('Profissional'),
  /** Competência (`AAAA-MM`) para o relatório de provisão. */
  competencia: competenciaOpcional,
  status: contaReceberStatusModalSchema.default('PENDENTE'),
  /**
   * Conta bancária e data do recebimento (decisão do dev na #46, para a Conciliação): só valem
   * com status Recebido. Sem data, o back usa a data de hoje; fora de Recebido, os dois são
   * limpos.
   */
  contaBancariaId: z
    .uuid({ error: 'Conta bancária inválida' })
    .nullish()
    .or(z.literal(''))
    .transform((valor) => valor || null),
  dataRecebimento: z.iso
    .date({ error: 'Data de recebimento inválida' })
    .nullish()
    .or(z.literal(''))
    .transform((valor) => valor || null),
});

export const contaReceberInputSchema = contaReceberCamposSchema.refine(
  (conta) => !(conta.pacienteId && conta.profissionalSacadoId),
  {
    error: 'Informe o paciente ou o profissional, não os dois',
    path: ['profissionalSacadoId'],
  },
);

export type ContaReceberFormulario = z.input<typeof contaReceberInputSchema>;
export type CreateContaReceberInput = z.output<typeof contaReceberInputSchema>;
export type UpdateContaReceberInput = CreateContaReceberInput;
export const createContaReceberSchema = contaReceberInputSchema;
export const updateContaReceberSchema = contaReceberInputSchema;

export const CONTA_RECEBER_SORT_FIELDS = [
  'id',
  'descricao',
  'cliente',
  'valor',
  'dataVencimento',
  'status',
] as const;

/** `GET /api/financeiro/contas-receber`. */
export const listContasReceberQuerySchema = listQuerySchema({
  sortFields: CONTA_RECEBER_SORT_FIELDS,
  defaultSort: 'dataVencimento:asc',
  filters: filtrosContaFinanceira(contaReceberFiltroStatusSchema),
});
export type ListContasReceberQuery = z.infer<typeof listContasReceberQuerySchema>;

export const CONTA_RECEBER_EXPORT_COLUMNS = [
  'id',
  'descricao',
  'cliente',
  'valor',
  'dataVencimento',
  'status',
] as const;
export type ContaReceberExportColumn = (typeof CONTA_RECEBER_EXPORT_COLUMNS)[number];

/** `GET /api/financeiro/contas-receber/export`. */
export const exportContasReceberQuerySchema = exportQuerySchema(
  listContasReceberQuerySchema,
  CONTA_RECEBER_EXPORT_COLUMNS,
);
export type ExportContasReceberQuery = z.infer<typeof exportContasReceberQuerySchema>;

export const contaReceberSchema = z.object({
  ...camposSaidaContaFinanceira,
  pacienteId: z.uuid().nullable(),
  pacienteNome: z.string().nullable(),
  profissionalSacadoId: z.uuid().nullable(),
  profissionalSacadoNome: z.string().nullable(),
  /** Contrato de sala de origem (cobranças geradas por contrato). */
  contratoSalaId: z.uuid().nullable(),
  contratoSalaNumero: z.number().int().nullable(),
  /** Título original, quando a conta nasceu de uma renegociação. */
  renegociadoDeId: z.uuid().nullable(),
  renegociadoDeNumero: z.number().int().nullable(),
  /** Números dos títulos gerados pela renegociação deste (vazio se não foi renegociado). */
  renegociadoParaNumeros: z.array(z.number().int()),
  competencia: z.string().nullable(),
  status: contaReceberStatusSchema,
  /** Soma das baixas não canceladas. */
  valorRecebido: decimal,
  /** Valor menos o recebido (o saldo em aberto, que a renegociação refaz). */
  saldo: decimal,
  /** Conta bancária e data da baixa mais recente. */
  contaBancariaId: z.uuid().nullable(),
  contaBancariaNome: z.string().nullable(),
  dataRecebimento: z.iso.date().nullable(),
});
export type ContaReceber = z.infer<typeof contaReceberSchema>;

export const contaReceberPageSchema = paginatedResponseSchema(contaReceberSchema);
export type ContaReceberPage = z.infer<typeof contaReceberPageSchema>;

// --- Baixa (modal "Baixar Conta a Receber", issue #165) ---

/** Código do 422 da baixa com valor acima do saldo em aberto. */
export const CONTA_RECEBER_BAIXA_EXCEDE_SALDO = 'CONTA_RECEBER_BAIXA_EXCEDE_SALDO';
/** Código do 422 da renegociação cujas parcelas não somam o saldo em aberto. */
export const CONTA_RECEBER_RENEGOCIACAO_SOMA = 'CONTA_RECEBER_RENEGOCIACAO_SOMA';

/**
 * `POST /api/financeiro/contas-receber/:id/baixar`. Aceita o valor recebido até o saldo em
 * aberto: duas baixas parciais que somam o total levam a conta a Pago.
 */
export const baixarContaReceberSchema = z.strictObject({
  dataRecebimento: z
    .string({ error: erroObrigatorio('Data de recebimento', 'f') })
    .min(1, { error: erroObrigatorio('Data de recebimento', 'f') })
    .pipe(z.iso.date({ error: 'Data de recebimento inválida' })),
  valorRecebido: z
    .number({ error: erroObrigatorio('Valor recebido') })
    .positive({ error: 'O valor recebido deve ser maior que zero' })
    .max(CONTA_FINANCEIRA_VALOR_MAX, { error: 'Valor inválido' }),
  formaPagamentoId: idOpcional('Forma de pagamento'),
  contaBancariaId: idOpcional('Conta bancária'),
  documento: documentoContaFinanceira,
  observacoes: observacoesContaFinanceira,
});
export type BaixarContaReceberFormulario = z.input<typeof baixarContaReceberSchema>;
export type BaixarContaReceberInput = z.output<typeof baixarContaReceberSchema>;

export const contaReceberBaixaSchema = z.object({
  id: z.uuid(),
  contaReceberId: z.uuid(),
  dataRecebimento: z.iso.date(),
  valorRecebido: decimal,
  formaPagamentoId: z.uuid().nullable(),
  formaPagamentoNome: z.string().nullable(),
  contaBancariaId: z.uuid().nullable(),
  contaBancariaNome: z.string().nullable(),
  documento: z.string().nullable(),
  observacoes: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ContaReceberBaixa = z.infer<typeof contaReceberBaixaSchema>;

// --- Renegociação ---

export const CONTA_RECEBER_RENEGOCIACAO_PARCELAS_MAX = 60;

/**
 * `POST /api/financeiro/contas-receber/:id/renegociar`: o saldo em aberto vira um ou mais
 * títulos novos (a soma precisa fechar com o saldo); o original passa a Renegociado.
 */
export const renegociarContaReceberSchema = z.strictObject({
  parcelas: z
    .array(
      z.strictObject({
        valor: z
          .number({ error: erroObrigatorio('Valor') })
          .positive({ error: 'O valor deve ser maior que zero' })
          .max(CONTA_FINANCEIRA_VALOR_MAX, { error: 'Valor inválido' }),
        dataVencimento: z
          .string({ error: erroObrigatorio('Data de vencimento', 'f') })
          .min(1, { error: erroObrigatorio('Data de vencimento', 'f') })
          .pipe(z.iso.date({ error: 'Data de vencimento inválida' })),
      }),
      { error: 'Informe as parcelas' },
    )
    .min(1, { error: 'Informe ao menos uma parcela' })
    .max(CONTA_RECEBER_RENEGOCIACAO_PARCELAS_MAX, {
      error: `No máximo ${CONTA_RECEBER_RENEGOCIACAO_PARCELAS_MAX} parcelas`,
    }),
  observacoes: observacoesContaFinanceira,
});
export type RenegociarContaReceberFormulario = z.input<typeof renegociarContaReceberSchema>;
export type RenegociarContaReceberInput = z.output<typeof renegociarContaReceberSchema>;
