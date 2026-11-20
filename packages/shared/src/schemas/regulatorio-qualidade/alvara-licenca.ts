import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { textoObrigatorio, erroObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

/**
 * Tela Alvarás e Licenças (`/alvaras`): tipos de licença e licenças por unidade.
 *
 * Status (filtro "Todos / OK / Alerta 60 dias / Alerta 30 dias / Vencido / N/A"), calculado a
 * partir da Data Vencimento: N/A quando "Não se aplica a esta unidade"; Vencido com menos de 0
 * dia; Alerta 30 dias de 0 a 30; Alerta 60 dias de 31 a 60; OK acima de 60 ou sem vencimento.
 */
export const LICENCA_STATUS = ['ok', 'alerta-60', 'alerta-30', 'vencido', 'na'] as const;
export const licencaStatusSchema = z.enum(LICENCA_STATUS);
export type LicencaStatus = z.infer<typeof licencaStatusSchema>;

export const LICENCA_ALERTA_60_DIAS = 60;
export const LICENCA_ALERTA_30_DIAS = 30;

/** Status da licença a partir do que o grid mostra (`diasRestantes` nulo = sem vencimento). */
export function statusDaLicenca(naoSeAplica: boolean, diasRestantes: number | null): LicencaStatus {
  if (naoSeAplica) return 'na';
  if (diasRestantes === null) return 'ok';
  if (diasRestantes < 0) return 'vencido';
  if (diasRestantes <= LICENCA_ALERTA_30_DIAS) return 'alerta-30';
  if (diasRestantes <= LICENCA_ALERTA_60_DIAS) return 'alerta-60';
  return 'ok';
}

const textoOpcional = (max: number, rotulo: string) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

const dataOpcional = (rotulo: string) =>
  z
    .union([z.literal(''), z.iso.date({ error: `${rotulo} inválida` })])
    .nullish()
    .transform((valor) => valor || null);

// ───────────────────────── Tipo de licença (modal "Novo Tipo de Licenca") ─────────────────────

export const TIPO_LICENCA_NOME_MAX = 150;

/** Só o Nome é obrigatório (confirmado pelo dev na issue #64). */
export const tipoLicencaInputSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: TIPO_LICENCA_NOME_MAX }),
  descricao: textoOpcional(500, 'Descrição'),
});

export type TipoLicencaFormInput = z.input<typeof tipoLicencaInputSchema>;
export type CreateTipoLicencaInput = z.output<typeof tipoLicencaInputSchema>;
export const createTipoLicencaSchema = tipoLicencaInputSchema;

export const tipoLicencaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  descricao: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type TipoLicenca = z.infer<typeof tipoLicencaSchema>;
export const tipoLicencaListSchema = z.array(tipoLicencaSchema);

// ───────────────────────────── Licença (modal "Nova Licenca") ──────────────────────────────────

/**
 * Corpo de `POST` e `PATCH /api/regulatorio-qualidade/licencas`. Obrigatórios: Unidade e Tipo de
 * Licença (confirmado pelo dev na issue #64, com o print do modal).
 */
export const licencaInputSchema = z.strictObject({
  unidadeId: z.uuid({ error: erroObrigatorio('Unidade', 'f') }),
  tipoLicencaId: z.uuid({ error: erroObrigatorio('Tipo de Licença') }),
  naoSeAplica: z.boolean().default(false),
  numeroDocumento: textoOpcional(100, 'Número do Documento'),
  orgaoEmissor: textoOpcional(150, 'Órgão Emissor'),
  titular: textoOpcional(150, 'Titular'),
  dataEmissao: dataOpcional('Data Emissão'),
  dataVencimento: dataOpcional('Data Vencimento'),
  telefone: textoOpcional(30, 'Telefone'),
  email: z
    .union([z.literal(''), z.email({ error: 'Email inválido' })])
    .nullish()
    .transform((valor) => valor || null),
  departamento: textoOpcional(150, 'Departamento'),
  plataformaOnline: z.boolean().default(false),
  comoRenovar: textoOpcional(2000, 'Como Renovar'),
  documentosObrigatorios: textoOpcional(2000, 'Documentos Obrigatórios'),
  enderecoPresencial: textoOpcional(200, 'Endereço Presencial'),
  horarioAtendimento: textoOpcional(100, 'Horário Atendimento'),
  prazoAnalise: textoOpcional(100, 'Prazo de Análise'),
  responsavel: textoOpcional(150, 'Responsável'),
  observacoes: textoOpcional(2000, 'Observações'),
});

export type LicencaFormInput = z.input<typeof licencaInputSchema>;
export type CreateLicencaInput = z.output<typeof licencaInputSchema>;
export type UpdateLicencaInput = CreateLicencaInput;
export const createLicencaSchema = licencaInputSchema;
export const updateLicencaSchema = licencaInputSchema;

/** Campos do grid. `dias` e `status` ordenam pela Data Vencimento. */
export const LICENCA_SORT_FIELDS = [
  'tipoLicenca',
  'unidade',
  'numeroDocumento',
  'orgaoEmissor',
  'dataVencimento',
  'dias',
  'status',
  'responsavel',
] as const;

export const listLicencasQuerySchema = listQuerySchema({
  sortFields: LICENCA_SORT_FIELDS,
  defaultSort: 'dataVencimento:asc',
  filters: {
    status: licencaStatusSchema.optional(),
    unidadeId: z.uuid({ error: 'Unidade inválida' }).optional(),
  },
});
export type ListLicencasQuery = z.infer<typeof listLicencasQuerySchema>;

export const LICENCA_EXPORT_COLUMNS = [
  'tipoLicenca',
  'unidade',
  'numeroDocumento',
  'orgaoEmissor',
  'dataVencimento',
  'dias',
  'status',
  'responsavel',
] as const;
export type LicencaExportColumn = (typeof LICENCA_EXPORT_COLUMNS)[number];

export const exportLicencasQuerySchema = exportQuerySchema(
  listLicencasQuerySchema,
  LICENCA_EXPORT_COLUMNS,
);
export type ExportLicencasQuery = z.infer<typeof exportLicencasQuerySchema>;

const texto = z.string().nullable();

export const licencaSchema = z.object({
  id: z.uuid(),
  unidadeId: z.uuid(),
  unidadeNome: z.string(),
  tipoLicencaId: z.uuid(),
  tipoLicencaNome: z.string(),
  naoSeAplica: z.boolean(),
  numeroDocumento: texto,
  orgaoEmissor: texto,
  titular: texto,
  /** `YYYY-MM-DD`. */
  dataEmissao: texto,
  /** `YYYY-MM-DD`. */
  dataVencimento: texto,
  telefone: texto,
  email: texto,
  departamento: texto,
  plataformaOnline: z.boolean(),
  comoRenovar: texto,
  documentosObrigatorios: texto,
  enderecoPresencial: texto,
  horarioAtendimento: texto,
  prazoAnalise: texto,
  responsavel: texto,
  observacoes: texto,
  /** Dias até o vencimento (negativo = vencida). Nulo sem Data Vencimento ou quando N/A. */
  diasRestantes: z.number().int().nullable(),
  status: licencaStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Licenca = z.infer<typeof licencaSchema>;

export const licencaPageSchema = paginatedResponseSchema(licencaSchema);
export type LicencaPage = z.infer<typeof licencaPageSchema>;

/** Cartões de totais do topo da tela (Total, OK, Alerta, Vencido, N/A) e abas Alertas / Ordem. */
export const licencaResumoQuerySchema = z.object({
  unidadeId: z.uuid({ error: 'Unidade inválida' }).optional(),
});
export type LicencaResumoQuery = z.infer<typeof licencaResumoQuerySchema>;

export const licencaResumoSchema = z.object({
  total: z.number().int(),
  ok: z.number().int(),
  alerta60: z.number().int(),
  alerta30: z.number().int(),
  vencido: z.number().int(),
  naoSeAplica: z.number().int(),
});
export type LicencaResumo = z.infer<typeof licencaResumoSchema>;

/** Abas Alertas e Ordem Renovação: lista curta (sem paginação), já ordenada. */
export const licencaListaSchema = z.array(licencaSchema);
export type LicencaLista = z.infer<typeof licencaListaSchema>;
