import { z } from 'zod';
import { mensagemObrigatoria, textoObrigatorio } from '../common/obrigatorio';

/**
 * Base comum de Contas a Pagar e Contas a Receber: os mesmos campos do modal, os mesmos filtros
 * do grid e o mesmo "Vencido" calculado. Cada tela acrescenta só o que é dela (beneficiário,
 * cliente, baixas).
 */

export const CONTA_FINANCEIRA_DESCRICAO_MAX = 200;
export const CONTA_FINANCEIRA_DOCUMENTO_MAX = 60;
export const CONTA_FINANCEIRA_OBSERVACOES_MAX = 2000;
/** Cabe em DECIMAL(12,2). */
export const CONTA_FINANCEIRA_VALOR_MAX = 999_999_999;
export const CONTA_FINANCEIRA_TOTAL_PARCELAS_MAX = 360;

/** Status exibido na linha: "Vencido" quando pendente e com vencimento no passado. */
export function statusExibicaoContaFinanceira<S extends string>(conta: {
  status: S;
  dataVencimento: string;
}): S | 'VENCIDO' {
  const hoje = new Date().toISOString().slice(0, 10);
  if (conta.status === 'PENDENTE' && conta.dataVencimento < hoje) return 'VENCIDO';
  return conta.status;
}

export const idOpcional = (rotulo: string) =>
  z
    .uuid({ error: `${rotulo} inválido` })
    .nullish()
    .transform((valor) => valor ?? null);

export const documentoContaFinanceira = z
  .string({ error: 'Documento inválido' })
  .trim()
  .max(CONTA_FINANCEIRA_DOCUMENTO_MAX, {
    error: `Documento deve ter no máximo ${CONTA_FINANCEIRA_DOCUMENTO_MAX} caracteres`,
  })
  .nullish()
  .transform((valor) => valor || null);

export const observacoesContaFinanceira = z
  .string({ error: 'Observações inválidas' })
  .trim()
  .max(CONTA_FINANCEIRA_OBSERVACOES_MAX, {
    error: `Observações devem ter no máximo ${CONTA_FINANCEIRA_OBSERVACOES_MAX} caracteres`,
  })
  .nullish()
  .transform((valor) => valor || null);

/** Campos do modal "Nova/Editar Conta" comuns às duas telas. */
export const camposEntradaContaFinanceira = {
  descricao: textoObrigatorio('Descrição', { max: CONTA_FINANCEIRA_DESCRICAO_MAX }),
  valor: z
    .number({ error: mensagemObrigatoria('Valor') })
    .positive({ error: 'O valor deve ser maior que zero' })
    .max(CONTA_FINANCEIRA_VALOR_MAX, { error: 'Valor inválido' }),
  dataVencimento: z
    .string({ error: mensagemObrigatoria('Data de vencimento', 'f') })
    .min(1, { error: mensagemObrigatoria('Data de vencimento', 'f') })
    .pipe(z.iso.date({ error: 'Data de vencimento inválida' })),
  formaPagamentoId: idOpcional('Forma de pagamento'),
  planoContaId: idOpcional('Plano de contas'),
  documento: documentoContaFinanceira,
  totalParcelas: z
    .number({ error: 'Total de parcelas inválido' })
    .int({ error: 'Total de parcelas deve ser um número inteiro' })
    .min(1, { error: 'Total de parcelas deve ser de 1 a 360' })
    .max(CONTA_FINANCEIRA_TOTAL_PARCELAS_MAX, { error: 'Total de parcelas deve ser de 1 a 360' })
    .default(1),
  observacoes: observacoesContaFinanceira,
};

/** Filtros do grid: chip de status (com "Vencido" calculado) e período de vencimento. */
export function filtrosContaFinanceira<T extends z.ZodType>(filtroStatus: T) {
  return {
    status: filtroStatus.optional(),
    vencimentoDe: z.iso.date({ error: 'Data inválida' }).optional(),
    vencimentoAte: z.iso.date({ error: 'Data inválida' }).optional(),
  };
}

/** Valores monetários chegam como texto decimal (ex.: `"150.00"`), exatos como no banco. */
export const decimal = z.string();

/** Campos da resposta comuns às duas telas. */
export const camposSaidaContaFinanceira = {
  id: z.uuid(),
  /** Número exibido na coluna "#". */
  numero: z.number().int(),
  descricao: z.string(),
  valor: decimal,
  dataVencimento: z.iso.date(),
  formaPagamentoId: z.uuid().nullable(),
  formaPagamentoNome: z.string().nullable(),
  planoContaId: z.uuid().nullable(),
  planoContaNome: z.string().nullable(),
  documento: z.string().nullable(),
  totalParcelas: z.number().int(),
  observacoes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};
