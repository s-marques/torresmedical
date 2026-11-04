import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const COMISSAO_STATUS = ['pendente', 'paga'] as const;
export const comissaoStatusSchema = z.enum(COMISSAO_STATUS, { error: 'Status inválido' });
export type ComissaoStatus = z.infer<typeof comissaoStatusSchema>;

export const COMISSAO_STATUS_ROTULOS: Record<ComissaoStatus, string> = {
  pendente: 'Pendente',
  paga: 'Paga',
};

const textoOpcional = (max: number, rotulo: string) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

/**
 * Corpo de `POST` e `PATCH /api/regulatorio-qualidade/funcionarios/:funcionarioId/comissoes`
 * (aba "Comissões", lançamento manual pelo RH — confirmado pelo dev na issue #67, sem vínculo
 * com vendas/financeiro).
 */
export const comissaoInputSchema = z.strictObject({
  valor: z.number({ error: 'Valor é obrigatório.' }).positive({ error: 'Valor inválido' }),
  dataReferencia: textoObrigatorio('Data de Referência').pipe(
    z.iso.date({ error: 'Data de Referência inválida' }),
  ),
  descricao: textoOpcional(500, 'Descrição'),
  status: comissaoStatusSchema.default('pendente'),
});

export type ComissaoFormInput = z.input<typeof comissaoInputSchema>;
export type CreateComissaoInput = z.output<typeof comissaoInputSchema>;
export type UpdateComissaoInput = CreateComissaoInput;
export const createComissaoSchema = comissaoInputSchema;
export const updateComissaoSchema = comissaoInputSchema;

export const COMISSAO_SORT_FIELDS = ['dataReferencia', 'valor', 'status'] as const;

export const listComissoesQuerySchema = listQuerySchema({
  sortFields: COMISSAO_SORT_FIELDS,
  defaultSort: 'dataReferencia:desc',
  filters: { status: comissaoStatusSchema.optional() },
});

export type ListComissoesQuery = z.infer<typeof listComissoesQuerySchema>;

const texto = z.string().nullable();

export const comissaoSchema = z.object({
  id: z.uuid(),
  funcionarioId: z.uuid(),
  /** Valor decimal exato como texto (ex.: `"150.50"`), como no banco. */
  valor: z.string(),
  dataReferencia: z.string(),
  descricao: texto,
  status: comissaoStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Comissao = z.infer<typeof comissaoSchema>;

export const comissaoPageSchema = paginatedResponseSchema(comissaoSchema);
export type ComissaoPage = z.infer<typeof comissaoPageSchema>;
