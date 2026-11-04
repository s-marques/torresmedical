import { z } from 'zod';
import { ativoStatusSchema, exportQuerySchema, listQuerySchema } from '../common/list-query';
import { textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const CARGO_NOME_MAX = 150;

const textoOpcional = (max: number, rotulo: string) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

/**
 * Corpo de `POST` e `PATCH /api/regulatorio-qualidade/cargos` (aba "Cargos" da tela
 * Funcionários). Só o Nome é obrigatório.
 */
export const cargoInputSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: CARGO_NOME_MAX }),
  departamento: textoOpcional(150, 'Departamento'),
  descricao: textoOpcional(500, 'Descrição'),
  salarioBase: z.number().nonnegative({ error: 'Salário Base inválido' }).nullish(),
  status: ativoStatusSchema.default('ativo'),
});

export type CargoFormInput = z.input<typeof cargoInputSchema>;
export type CreateCargoInput = z.output<typeof cargoInputSchema>;
export type UpdateCargoInput = CreateCargoInput;
export const createCargoSchema = cargoInputSchema;
export const updateCargoSchema = cargoInputSchema;

export const CARGO_SORT_FIELDS = ['nome', 'departamento', 'descricao', 'salarioBase'] as const;

export const listCargosQuerySchema = listQuerySchema({
  sortFields: CARGO_SORT_FIELDS,
  defaultSort: 'nome:asc',
  filters: { status: ativoStatusSchema.optional() },
});

export type ListCargosQuery = z.infer<typeof listCargosQuerySchema>;

export const CARGO_EXPORT_COLUMNS = [
  'nome',
  'departamento',
  'descricao',
  'salarioBase',
  'status',
] as const;
export type CargoExportColumn = (typeof CARGO_EXPORT_COLUMNS)[number];

export const exportCargosQuerySchema = exportQuerySchema(
  listCargosQuerySchema,
  CARGO_EXPORT_COLUMNS,
);
export type ExportCargosQuery = z.infer<typeof exportCargosQuerySchema>;

const texto = z.string().nullable();

export const cargoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  departamento: texto,
  descricao: texto,
  /** Valor decimal exato como texto (ex.: `"8000.00"`), como no banco. */
  salarioBase: texto,
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Cargo = z.infer<typeof cargoSchema>;

export const cargoPageSchema = paginatedResponseSchema(cargoSchema);
export type CargoPage = z.infer<typeof cargoPageSchema>;
