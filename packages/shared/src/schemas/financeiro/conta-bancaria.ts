import { z } from 'zod';
import { mensagemObrigatoria, textoObrigatorio } from '../common/obrigatorio';
import { searchSchema } from '../common/list-query';

/**
 * Conta bancária do Financeiro. Cadastrada na aba "Contas Bancárias" da tela Conciliação (#46) e
 * usada nos comboboxes "Conta Bancária" da Baixa de Contas a Pagar (#47) e do recebimento de
 * Contas a Receber. Campos confirmados pelo dev na #46: Nome, Tipo, Banco, Agência, Conta, Saldo
 * inicial e a data do saldo inicial.
 */

/** Tipos citados na aba: "caixa, corrente, poupança e investimento". */
export const CONTA_BANCARIA_TIPOS = ['CAIXA', 'CORRENTE', 'POUPANCA', 'INVESTIMENTO'] as const;
export const contaBancariaTipoSchema = z.enum(CONTA_BANCARIA_TIPOS, {
  error: mensagemObrigatoria('Tipo'),
});
export type ContaBancariaTipo = (typeof CONTA_BANCARIA_TIPOS)[number];

export const CONTA_BANCARIA_ROTULO_TIPO: Readonly<Record<ContaBancariaTipo, string>> = {
  CAIXA: 'Caixa',
  CORRENTE: 'Corrente',
  POUPANCA: 'Poupança',
  INVESTIMENTO: 'Investimento',
};

export const CONTA_BANCARIA_NOME_MAX = 120;
export const CONTA_BANCARIA_BANCO_MAX = 120;
export const CONTA_BANCARIA_AGENCIA_MAX = 20;
export const CONTA_BANCARIA_CONTA_MAX = 30;
/** Cabe em DECIMAL(14,2), com sinal: o saldo inicial pode ser negativo. */
export const CONTA_BANCARIA_SALDO_MAX = 999_999_999_999;

function textoOpcional(rotulo: string, max: number) {
  return z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);
}

/** `POST /api/financeiro/contas-bancarias` (modal "Nova Conta"). */
export const contaBancariaInputSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: CONTA_BANCARIA_NOME_MAX }),
  tipo: contaBancariaTipoSchema,
  banco: textoOpcional('Banco', CONTA_BANCARIA_BANCO_MAX),
  agencia: textoOpcional('Agência', CONTA_BANCARIA_AGENCIA_MAX),
  conta: textoOpcional('Conta', CONTA_BANCARIA_CONTA_MAX),
  saldoInicial: z
    .number({ error: 'Saldo inicial inválido' })
    .min(-CONTA_BANCARIA_SALDO_MAX, { error: 'Saldo inicial inválido' })
    .max(CONTA_BANCARIA_SALDO_MAX, { error: 'Saldo inicial inválido' })
    .nullish()
    .transform((valor) => valor ?? 0),
  /** Data a partir da qual os pagamentos e recebimentos somam no saldo. Vazia: todos. */
  dataSaldoInicial: z.iso
    .date({ error: 'Data do saldo inicial inválida' })
    .nullish()
    .or(z.literal(''))
    .transform((valor) => valor || null),
});
export type ContaBancariaFormulario = z.input<typeof contaBancariaInputSchema>;
export type CreateContaBancariaInput = z.output<typeof contaBancariaInputSchema>;
export const createContaBancariaSchema = contaBancariaInputSchema;

export const contaBancariaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  tipo: contaBancariaTipoSchema,
  banco: z.string().nullable(),
  agencia: z.string().nullable(),
  conta: z.string().nullable(),
  /** Texto decimal (ex.: `"150.00"`), exato como no banco. */
  saldoInicial: z.string(),
  dataSaldoInicial: z.iso.date().nullable(),
  /** Saldo inicial + recebimentos − pagamentos lançados na conta (desde a data do saldo inicial). */
  saldo: z.string(),
  ativo: z.boolean(),
});
export type ContaBancaria = z.infer<typeof contaBancariaSchema>;

/** `GET /api/financeiro/contas-bancarias`. Só as ativas, ordenadas pelo nome. */
export const listContasBancariasQuerySchema = z.object({ search: searchSchema });
export type ListContasBancariasQuery = z.infer<typeof listContasBancariasQuerySchema>;

export const contaBancariaListaSchema = z.object({
  data: z.array(contaBancariaSchema),
  total: z.number().int().min(0),
});
export type ContaBancariaLista = z.infer<typeof contaBancariaListaSchema>;

/** Linha de identificação do card: "SICOOB CREDISUL | Ag 3325 | CC 336709-6". */
export function descricaoContaBancaria(
  conta: Pick<ContaBancaria, 'banco' | 'agencia' | 'conta'>,
): string {
  return [conta.banco, conta.agencia && `Ag ${conta.agencia}`, conta.conta && `CC ${conta.conta}`]
    .filter(Boolean)
    .join(' | ');
}
