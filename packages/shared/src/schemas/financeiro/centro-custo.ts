import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const CENTRO_CUSTO_NOME_MAX = 100;

const nome = textoObrigatorio('Nome', { max: CENTRO_CUSTO_NOME_MAX });

/** `POST /api/financeiro/centros-custo` (issue #163): cadastro simples, só o nome. */
export const createCentroCustoSchema = z.strictObject({ nome });
export type CreateCentroCustoInput = z.infer<typeof createCentroCustoSchema>;
export type CentroCustoFormulario = z.input<typeof createCentroCustoSchema>;

/** `PATCH /api/financeiro/centros-custo/:id`. `ativo` é o interruptor da linha. */
export const updateCentroCustoSchema = z
  .strictObject({
    nome: nome.optional(),
    ativo: z.boolean({ error: 'Valor inválido' }).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Informe ao menos um campo para alterar',
  });
export type UpdateCentroCustoInput = z.infer<typeof updateCentroCustoSchema>;

export const CENTRO_CUSTO_SORT_FIELDS = ['nome', 'createdAt'] as const;

/** `GET /api/financeiro/centros-custo`. */
export const listCentrosCustoQuerySchema = listQuerySchema({
  sortFields: CENTRO_CUSTO_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {},
});
export type ListCentrosCustoQuery = z.infer<typeof listCentrosCustoQuerySchema>;

export const centroCustoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CentroCusto = z.infer<typeof centroCustoSchema>;

export const centroCustoPageSchema = paginatedResponseSchema(centroCustoSchema);
export type CentroCustoPage = z.infer<typeof centroCustoPageSchema>;
