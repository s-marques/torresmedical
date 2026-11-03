import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';
import {
  categoriaProtocoloSchema,
  PROTOCOLO_CATEGORIA_MAX,
  PROTOCOLO_NOME_MAX,
  PROTOCOLO_SEMANAS_MAX,
  textoLongoProtocoloSchema,
  totalSemanasSchema,
  valorProtocoloSchema,
} from './protocolo';

/** Uma semana do modal "Novo Protocolo Mãe" (select de protocolo + observações da semana). */
export const protocoloMaeSemanaInputSchema = z.strictObject({
  semana: z
    .number({ error: 'Semana inválida' })
    .int({ error: 'Semana inválida' })
    .min(1, { error: 'Semana inválida' })
    .max(PROTOCOLO_SEMANAS_MAX, { error: 'Semana inválida' }),
  /** "-- Sem protocolo --" é `null`. */
  protocoloId: z
    .uuid({ error: 'Protocolo inválido' })
    .nullish()
    .transform((valor) => valor ?? null),
  observacoes: textoLongoProtocoloSchema('Observação'),
});

/**
 * Corpo de `POST` e `PATCH /api/gestao-profissionais/protocolos-mae`. Nome e total de semanas
 * são obrigatórios; o nome não pode repetir (verificado no service).
 */
export const protocoloMaeInputSchema = z
  .strictObject({
    nome: textoObrigatorio('Nome', { max: PROTOCOLO_NOME_MAX }),
    categoria: categoriaProtocoloSchema,
    totalSemanas: totalSemanasSchema,
    valorTotal: valorProtocoloSchema,
    descricao: textoLongoProtocoloSchema('Descrição'),
    semanas: z.array(protocoloMaeSemanaInputSchema).default([]),
  })
  .superRefine((valor, ctx) => {
    const vistas = new Set<number>();
    valor.semanas.forEach((semana, indice) => {
      if (semana.semana > valor.totalSemanas) {
        ctx.addIssue({
          code: 'custom',
          path: ['semanas', indice, 'semana'],
          message: 'A semana excede o total de semanas',
        });
      }
      if (vistas.has(semana.semana)) {
        ctx.addIssue({
          code: 'custom',
          path: ['semanas', indice, 'semana'],
          message: 'Semana repetida',
        });
      }
      vistas.add(semana.semana);
    });
  });

export type ProtocoloMaeFormulario = z.input<typeof protocoloMaeInputSchema>;
export type CreateProtocoloMaeInput = z.output<typeof protocoloMaeInputSchema>;
export type UpdateProtocoloMaeInput = CreateProtocoloMaeInput;
export const createProtocoloMaeSchema = protocoloMaeInputSchema;
export const updateProtocoloMaeSchema = protocoloMaeInputSchema;

export const PROTOCOLO_MAE_SORT_FIELDS = ['nome', 'valorTotal', 'totalSemanas'] as const;

export const listProtocolosMaeQuerySchema = listQuerySchema({
  sortFields: PROTOCOLO_MAE_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: {
    categoria: z
      .string()
      .trim()
      .max(PROTOCOLO_CATEGORIA_MAX)
      .optional()
      .transform((valor) => valor || undefined),
  },
});
export type ListProtocolosMaeQuery = z.infer<typeof listProtocolosMaeQuerySchema>;

export const protocoloMaeSemanaSchema = z.object({
  semana: z.number().int(),
  protocoloId: z.uuid().nullable(),
  protocoloNome: z.string().nullable(),
  observacoes: z.string().nullable(),
});
export type ProtocoloMaeSemana = z.infer<typeof protocoloMaeSemanaSchema>;

export const protocoloMaeSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  categoria: z.string(),
  totalSemanas: z.number().int(),
  valorTotal: z.number(),
  descricao: z.string().nullable(),
  semanas: z.array(protocoloMaeSemanaSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProtocoloMae = z.infer<typeof protocoloMaeSchema>;

export const protocoloMaePageSchema = paginatedResponseSchema(protocoloMaeSchema);
export type ProtocoloMaePage = z.infer<typeof protocoloMaePageSchema>;
