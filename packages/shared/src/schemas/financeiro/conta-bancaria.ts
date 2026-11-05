import { z } from 'zod';
import { searchSchema } from '../common/list-query';

/**
 * Conta bancária usada no combobox "Conta Bancária" da Baixa de Contas a Pagar (issue #47).
 * Ainda sem tela de cadastro própria: listagem simples, sem paginação, como Plano de Contas.
 */
export const contaBancariaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  banco: z.string().nullable(),
  ativo: z.boolean(),
});
export type ContaBancaria = z.infer<typeof contaBancariaSchema>;

/** `GET /api/financeiro/contas-bancarias`. Só as ativas (para o combobox). */
export const listContasBancariasQuerySchema = z.object({ search: searchSchema });
export type ListContasBancariasQuery = z.infer<typeof listContasBancariasQuerySchema>;

export const contaBancariaListaSchema = z.object({
  data: z.array(contaBancariaSchema),
  total: z.number().int().min(0),
});
export type ContaBancariaLista = z.infer<typeof contaBancariaListaSchema>;
