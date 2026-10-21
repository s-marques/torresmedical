import { z } from 'zod';
import { ativoStatusSchema, listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const SALA_NOME_MAX = 100;
export const SALA_NUMERO_MAX = 20;
export const SALA_ANDAR_MAX = 30;
export const SALA_EQUIPAMENTOS_MAX = 1000;
export const SALA_VALOR_MAX = 9_999_999.99;
export const SALA_METRAGEM_MAX = 99_999.99;
export const SALA_CAPACIDADE_PADRAO = 1;

/** Opções do select "Tipo" (prints do inventário: Consultório e Reunião). */
export const SALA_TIPOS = ['CONSULTORIO', 'REUNIAO'] as const;
export const salaTipoSchema = z.enum(SALA_TIPOS, { error: 'Tipo inválido' });
export type SalaTipo = z.infer<typeof salaTipoSchema>;

export const SALA_TIPO_ROTULOS: Record<SalaTipo, string> = {
  CONSULTORIO: 'Consultório',
  REUNIAO: 'Reunião',
};

const textoOpcional = (max: number, rotulo: string) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

const numeroOpcional = (rotulo: string, max: number) =>
  z
    .number({ error: `${rotulo} inválido` })
    .min(0, { error: `${rotulo} não pode ser negativo` })
    .max(max, { error: `${rotulo} inválido` })
    .nullish()
    .transform((valor) => valor ?? null);

/**
 * Corpo de `POST` e `PATCH /api/gestao-profissionais/salas` (modais "Nova Sala" e "Editar
 * Sala"). O `PATCH` substitui os campos do formulário.
 */
export const salaInputSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: SALA_NOME_MAX }),
  numero: textoOpcional(SALA_NUMERO_MAX, 'Número'),
  andar: textoOpcional(SALA_ANDAR_MAX, 'Andar'),
  tipo: salaTipoSchema.default('CONSULTORIO'),
  metragem: numeroOpcional('m²', SALA_METRAGEM_MAX),
  valorHora: numeroOpcional('Valor por hora', SALA_VALOR_MAX),
  valorTurno: numeroOpcional('Valor por turno', SALA_VALOR_MAX),
  valorMensal: numeroOpcional('Valor mensal', SALA_VALOR_MAX),
  equipamentos: textoOpcional(SALA_EQUIPAMENTOS_MAX, 'Equipamentos'),
});

export type SalaFormulario = z.input<typeof salaInputSchema>;
export type CreateSalaInput = z.output<typeof salaInputSchema>;
export type UpdateSalaInput = CreateSalaInput;
export const createSalaSchema = salaInputSchema;
export const updateSalaSchema = salaInputSchema;

export const SALA_SORT_FIELDS = ['nome', 'numero', 'andar', 'valorMensal'] as const;

/** `GET /api/gestao-profissionais/salas`: busca por nome, número, andar e equipamentos. */
export const listSalasQuerySchema = listQuerySchema({
  sortFields: SALA_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {
    status: ativoStatusSchema.optional(),
    tipo: salaTipoSchema.optional(),
  },
});

export type ListSalasQuery = z.infer<typeof listSalasQuerySchema>;

export const salaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  numero: z.string().nullable(),
  andar: z.string().nullable(),
  tipo: salaTipoSchema,
  capacidade: z.number().int(),
  metragem: z.number().nullable(),
  valorHora: z.number().nullable(),
  valorTurno: z.number().nullable(),
  valorMensal: z.number().nullable(),
  equipamentos: z.string().nullable(),
  ativo: z.boolean(),
  /** Com vínculo em outro cadastro (contrato): não pode ser excluída. */
  emUso: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Sala = z.infer<typeof salaSchema>;

export const salaPageSchema = paginatedResponseSchema(salaSchema);
export type SalaPage = z.infer<typeof salaPageSchema>;
