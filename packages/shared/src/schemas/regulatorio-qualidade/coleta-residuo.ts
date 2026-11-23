import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { erroObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

export const COLETA_RESIDUO_EMPRESA_MAX = 200;
export const COLETA_RESIDUO_MTR_MAX = 100;
export const COLETA_RESIDUO_RESPONSAVEL_MAX = 150;
export const COLETA_RESIDUO_OBSERVACOES_MAX = 2000;
export const COLETA_RESIDUO_PESO_MAX = 99_999_999.99;

/** Select "Tipo Residuo" do modal (lista do print do dev na #65: Infectante, Perfurocortante, Químico). */
export const COLETA_RESIDUO_TIPOS = ['INFECTANTE', 'PERFUROCORTANTE', 'QUIMICO'] as const;
export const coletaResiduoTipoSchema = z.enum(COLETA_RESIDUO_TIPOS, {
  error: erroObrigatorio('Tipo Resíduo'),
});
export type ColetaResiduoTipo = z.infer<typeof coletaResiduoTipoSchema>;
/** Rótulos em português (exportação Excel/PDF). Na tela, o front traduz por `coletasResiduo.tipos`. */
export const COLETA_RESIDUO_TIPO_ROTULOS: Readonly<Record<ColetaResiduoTipo, string>> = {
  INFECTANTE: 'Infectante',
  PERFUROCORTANTE: 'Perfurocortante',
  QUIMICO: 'Químico',
};

/** Texto opcional: vazio vira `null`. */
const textoOpcional = (max: number, rotulo: string) =>
  z
    .string()
    .trim()
    .max(max, {
      error: () => traduzirValidacao('validacao.campoMax', { campo: rotulo, count: max }),
    })
    .nullish()
    .transform((valor) => valor || null);

/** Data `AAAA-MM-DD` opcional: vazio vira `null`. */
const dataOpcional = () =>
  z
    .string()
    .nullish()
    .transform((valor) => valor || null)
    .pipe(z.iso.date().nullable());

/**
 * Corpo de `POST` e `PATCH /api/regulatorio-qualidade/coletas-residuo` (modal "Nova Coleta de
 * Residuo"). O `PATCH` substitui todos os campos. Obrigatórios: Data Coleta e Tipo Resíduo
 * (asterisco do print; confirmado pelo dev na #65: só a regra padrão de obrigatório).
 */
export const coletaResiduoInputSchema = z.strictObject({
  dataColeta: z.iso.date({ error: erroObrigatorio('Data Coleta', 'f') }),
  proximaColeta: dataOpcional(),
  empresaColetora: textoOpcional(COLETA_RESIDUO_EMPRESA_MAX, 'Empresa Coletora'),
  manifestoMtr: textoOpcional(COLETA_RESIDUO_MTR_MAX, 'Manifesto MTR'),
  pesoKg: z
    .number()
    .min(0)
    .max(COLETA_RESIDUO_PESO_MAX)
    .nullish()
    .transform((valor) => valor ?? null),
  tipoResiduo: coletaResiduoTipoSchema,
  responsavel: textoOpcional(COLETA_RESIDUO_RESPONSAVEL_MAX, 'Responsável'),
  observacoes: textoOpcional(COLETA_RESIDUO_OBSERVACOES_MAX, 'Observações'),
});

export type ColetaResiduoFormInput = z.input<typeof coletaResiduoInputSchema>;
export type CreateColetaResiduoInput = z.output<typeof coletaResiduoInputSchema>;
export type UpdateColetaResiduoInput = CreateColetaResiduoInput;
export const createColetaResiduoSchema = coletaResiduoInputSchema;
export const updateColetaResiduoSchema = coletaResiduoInputSchema;

/** Colunas ordenáveis do grid (todas as do inventário). */
export const COLETA_RESIDUO_SORT_FIELDS = [
  'dataColeta',
  'proximaColeta',
  'empresaColetora',
  'manifestoMtr',
  'pesoKg',
  'tipoResiduo',
  'responsavel',
] as const;

/** `GET /api/regulatorio-qualidade/coletas-residuo`: busca "Buscar coletas..." (`search`) e ordenação. */
export const listColetasResiduoQuerySchema = listQuerySchema({
  sortFields: COLETA_RESIDUO_SORT_FIELDS,
  defaultSort: 'dataColeta:desc',
  filters: {},
});

export type ListColetasResiduoQuery = z.infer<typeof listColetasResiduoQuerySchema>;

export const COLETA_RESIDUO_EXPORT_COLUMNS = COLETA_RESIDUO_SORT_FIELDS;
export type ColetaResiduoExportColumn = (typeof COLETA_RESIDUO_EXPORT_COLUMNS)[number];

/** `GET /api/regulatorio-qualidade/coletas-residuo/export`. */
export const exportColetasResiduoQuerySchema = exportQuerySchema(
  listColetasResiduoQuerySchema,
  COLETA_RESIDUO_EXPORT_COLUMNS,
);

export type ExportColetasResiduoQuery = z.infer<typeof exportColetasResiduoQuerySchema>;

const texto = z.string().nullable();

export const coletaResiduoSchema = z.object({
  id: z.uuid(),
  dataColeta: z.iso.date(),
  proximaColeta: z.iso.date().nullable(),
  empresaColetora: texto,
  manifestoMtr: texto,
  pesoKg: z.number().nullable(),
  tipoResiduo: coletaResiduoTipoSchema,
  responsavel: texto,
  observacoes: texto,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ColetaResiduo = z.infer<typeof coletaResiduoSchema>;

export const coletaResiduoPageSchema = paginatedResponseSchema(coletaResiduoSchema);

export type ColetaResiduoPage = z.infer<typeof coletaResiduoPageSchema>;
