import { z } from 'zod';
import {
  dataSchemaOpcional,
  PERIODO_CONSULTA_INVALIDO,
} from '../comercial-atendimento/periodo-vendas';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { mensagemObrigatoria, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

// --- Tipos e status ----------------------------------------------------------------------

/** Tipos de receituário controlado (ANVISA), na ordem do inventário. */
export const RECEITUARIO_TIPOS = ['AMARELA', 'AZUL', 'BRANCA'] as const;
export const receituarioTipoSchema = z.enum(RECEITUARIO_TIPOS, { error: 'Tipo inválido' });
export type ReceituarioTipo = (typeof RECEITUARIO_TIPOS)[number];

/** Rótulos do select do modal "Novo Bloco de Receituario" e da coluna Tipo. */
export const RECEITUARIO_TIPO_ROTULOS: Readonly<Record<ReceituarioTipo, string>> = {
  AMARELA: 'Amarela (A)',
  AZUL: 'Azul (B)',
  BRANCA: 'Branca (C)',
};

/** Rótulos do filtro "Todos os tipos" (dropdown do inventário: Amarela · Azul · Branca). */
export const RECEITUARIO_TIPO_ROTULOS_FILTRO: Readonly<Record<ReceituarioTipo, string>> = {
  AMARELA: 'Amarela',
  AZUL: 'Azul',
  BRANCA: 'Branca',
};

/**
 * Status do bloco. Nasce Ativo e vira Finalizado sozinho quando todas as folhas são usadas.
 * "Cancelado" existe só no filtro: não há ação de cancelar nesta tela (decisão do dev, #42).
 */
export const RECEITUARIO_BLOCO_STATUS = ['ATIVO', 'FINALIZADO', 'CANCELADO'] as const;
export const receituarioBlocoStatusSchema = z.enum(RECEITUARIO_BLOCO_STATUS, {
  error: 'Status inválido',
});
export type ReceituarioBlocoStatus = (typeof RECEITUARIO_BLOCO_STATUS)[number];

export const RECEITUARIO_BLOCO_STATUS_ROTULOS: Readonly<Record<ReceituarioBlocoStatus, string>> = {
  ATIVO: 'Ativo',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
};

/** Numeração com 6 dígitos, como no placeholder do modal ("000001"). */
export const RECEITUARIO_NUMERO_MAX = 999_999;
export const RECEITUARIO_LOCALIZACAO_MAX = 120;
export const PRESCRICAO_MEDICACAO_MAX = 2000;
export const PRESCRICAO_POSOLOGIA_MAX = 2000;

/** Número da folha com zeros à esquerda (ex.: 7 → "000007"). */
export function formatarNumeroReceita(numero: number): string {
  return String(numero).padStart(6, '0');
}

/** Coluna "Numeracao" do bloco (ex.: "000001 - 000020"). */
export function formatarNumeracaoBloco(bloco: { numeroInicio: number; numeroFim: number }): string {
  return `${formatarNumeroReceita(bloco.numeroInicio)} - ${formatarNumeroReceita(bloco.numeroFim)}`;
}

// --- Helpers de campo --------------------------------------------------------------------

const idObrigatorio = (rotulo: string) =>
  z
    .string({ error: mensagemObrigatoria(rotulo) })
    .min(1, { error: mensagemObrigatoria(rotulo) })
    .pipe(z.uuid({ error: `${rotulo} inválido` }));

const textoOpcional = (rotulo: string, max: number) =>
  z
    .string({ error: `${rotulo} inválido` })
    .trim()
    .max(max, { error: `${rotulo} deve ter no máximo ${max} caracteres` })
    .nullish()
    .transform((valor) => valor || null);

const dataOpcional = (rotulo: string) =>
  z
    .string({ error: `${rotulo} inválida` })
    .nullish()
    .transform((valor) => valor || null)
    .pipe(z.iso.date({ error: `${rotulo} inválida` }).nullable());

const numeroFolha = (rotulo: string) =>
  z
    .number({ error: mensagemObrigatoria(rotulo) })
    .int({ error: `${rotulo} deve ser um número inteiro` })
    .min(1, { error: `${rotulo} deve ser maior que zero` })
    .max(RECEITUARIO_NUMERO_MAX, {
      error: `${rotulo} deve ter no máximo ${String(RECEITUARIO_NUMERO_MAX).length} dígitos`,
    });

const periodoCoerente = <T extends { de?: string | undefined; ate?: string | undefined }>(
  consulta: T,
) => !consulta.de || !consulta.ate || consulta.de <= consulta.ate;

// --- Blocos ------------------------------------------------------------------------------

export const NUMERO_FIM_MENOR_QUE_INICIO = 'Número fim deve ser maior ou igual ao início';

/**
 * `POST /api/consultorio-assistencial/receituarios/blocos` (modal "Novo Bloco de Receituario").
 * "ID do Medico" virou o select de profissional (decisão do dev na issue #42).
 */
export const receituarioBlocoInputSchema = z
  .strictObject({
    tipo: z
      .string({ error: mensagemObrigatoria('Tipo') })
      .min(1, { error: mensagemObrigatoria('Tipo') })
      .pipe(receituarioTipoSchema),
    numeroInicio: numeroFolha('Número início'),
    numeroFim: numeroFolha('Número fim'),
    localizacao: textoOpcional('Localização', RECEITUARIO_LOCALIZACAO_MAX),
    profissionalId: z
      .string({ error: 'Médico inválido' })
      .nullish()
      .transform((valor) => valor || null)
      .pipe(z.uuid({ error: 'Médico inválido' }).nullable()),
    dataRecebimento: dataOpcional('Data de recebimento'),
  })
  .refine((bloco) => bloco.numeroFim >= bloco.numeroInicio, {
    error: NUMERO_FIM_MENOR_QUE_INICIO,
    path: ['numeroFim'],
  });
export type ReceituarioBlocoFormulario = z.input<typeof receituarioBlocoInputSchema>;
export type CreateReceituarioBlocoInput = z.output<typeof receituarioBlocoInputSchema>;
export const createReceituarioBlocoSchema = receituarioBlocoInputSchema;

/** Colunas ordenáveis do grid Blocos (inventário: Tipo, Localizacao, Medico e Status). */
export const RECEITUARIO_BLOCO_SORT_FIELDS = [
  'tipo',
  'localizacao',
  'medico',
  'status',
  'createdAt',
] as const;
export type ReceituarioBlocoSortField = (typeof RECEITUARIO_BLOCO_SORT_FIELDS)[number];

const filtrosBloco = {
  tipo: receituarioTipoSchema.optional(),
  status: receituarioBlocoStatusSchema.optional(),
};

/** `GET /api/consultorio-assistencial/receituarios/blocos`. */
export const listReceituarioBlocosQuerySchema = listQuerySchema({
  sortFields: RECEITUARIO_BLOCO_SORT_FIELDS,
  defaultSort: 'createdAt:desc',
  filters: filtrosBloco,
});
export type ListReceituarioBlocosQuery = z.infer<typeof listReceituarioBlocosQuerySchema>;

/** Colunas do grid Blocos, na ordem do inventário. */
export const RECEITUARIO_BLOCO_EXPORT_COLUMNS = [
  'tipo',
  'numeracao',
  'localizacao',
  'medico',
  'usados',
  'status',
] as const;
export type ReceituarioBlocoExportColumn = (typeof RECEITUARIO_BLOCO_EXPORT_COLUMNS)[number];

export const exportReceituarioBlocosQuerySchema = exportQuerySchema(
  listReceituarioBlocosQuerySchema,
  RECEITUARIO_BLOCO_EXPORT_COLUMNS,
);
export type ExportReceituarioBlocosQuery = z.infer<typeof exportReceituarioBlocosQuerySchema>;

export const receituarioBlocoSchema = z.object({
  id: z.uuid(),
  tipo: receituarioTipoSchema,
  numeroInicio: z.number().int(),
  numeroFim: z.number().int(),
  localizacao: z.string().nullable(),
  profissionalId: z.uuid().nullable(),
  profissionalNome: z.string().nullable(),
  dataRecebimento: z.iso.date().nullable(),
  /** Coluna "Usados/Total". */
  usados: z.number().int(),
  total: z.number().int(),
  status: receituarioBlocoStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ReceituarioBloco = z.infer<typeof receituarioBlocoSchema>;

export const receituarioBlocoPageSchema = paginatedResponseSchema(receituarioBlocoSchema);
export type ReceituarioBlocoPage = z.infer<typeof receituarioBlocoPageSchema>;

/**
 * `GET .../receituarios/blocos/disponiveis`: select "Bloco" da Nova Prescricao. Só blocos Ativos,
 * com médico definido e no escopo do usuário (decisão do dev na issue #42).
 */
export const receituarioBlocosDisponiveisSchema = z.array(receituarioBlocoSchema);

// --- Prescrições -------------------------------------------------------------------------

/**
 * `POST /api/consultorio-assistencial/receituarios/prescricoes` (modal "Nova Prescricao"). O
 * número da receita é a próxima folha livre do bloco e o médico é o do bloco (decisões do dev
 * na issue #42). "ID do Paciente" virou o select de paciente.
 */
export const prescricaoInputSchema = z.strictObject({
  blocoId: idObrigatorio('Bloco'),
  pacienteId: idObrigatorio('Paciente'),
  medicacao: textoObrigatorio('Medicação', { genero: 'f', max: PRESCRICAO_MEDICACAO_MAX }),
  posologia: textoOpcional('Posologia', PRESCRICAO_POSOLOGIA_MAX),
  /** Vazio: o servidor grava a data de hoje (o modal já abre com hoje). */
  dataPrescricao: dataOpcional('Data da prescrição'),
});
export type PrescricaoFormulario = z.input<typeof prescricaoInputSchema>;
export type CreatePrescricaoInput = z.output<typeof prescricaoInputSchema>;
export const createPrescricaoSchema = prescricaoInputSchema;

/** Colunas do grid Prescricoes (todas ordenáveis no inventário). */
export const PRESCRICAO_SORT_FIELDS = [
  'numero',
  'tipo',
  'paciente',
  'medico',
  'medicacao',
  'dataPrescricao',
] as const;
export type PrescricaoSortField = (typeof PRESCRICAO_SORT_FIELDS)[number];

const filtrosPrescricao = {
  tipo: receituarioTipoSchema.optional(),
  /** Período De/Até da data da prescrição (`AAAA-MM-DD`), ambos opcionais. */
  de: dataSchemaOpcional('inicial'),
  ate: dataSchemaOpcional('final'),
};

/** `GET /api/consultorio-assistencial/receituarios/prescricoes`. */
export const listPrescricoesQuerySchema = listQuerySchema({
  sortFields: PRESCRICAO_SORT_FIELDS,
  defaultSort: 'dataPrescricao:desc',
  filters: filtrosPrescricao,
}).refine(periodoCoerente, { error: PERIODO_CONSULTA_INVALIDO, path: ['ate'] });
export type ListPrescricoesQuery = z.infer<typeof listPrescricoesQuerySchema>;

export const PRESCRICAO_EXPORT_COLUMNS = PRESCRICAO_SORT_FIELDS;
export type PrescricaoExportColumn = (typeof PRESCRICAO_EXPORT_COLUMNS)[number];

export const exportPrescricoesQuerySchema = exportQuerySchema(
  z.object({
    sort: listPrescricoesQuerySchema.shape.sort,
    search: listPrescricoesQuerySchema.shape.search,
    ...filtrosPrescricao,
  }),
  PRESCRICAO_EXPORT_COLUMNS,
).refine(periodoCoerente, { error: PERIODO_CONSULTA_INVALIDO, path: ['ate'] });
export type ExportPrescricoesQuery = z.infer<typeof exportPrescricoesQuerySchema>;

export const prescricaoSchema = z.object({
  id: z.uuid(),
  /** Coluna "N Receita": folha do bloco. */
  numero: z.number().int(),
  tipo: receituarioTipoSchema,
  blocoId: z.uuid(),
  pacienteId: z.uuid(),
  pacienteNome: z.string().nullable(),
  profissionalId: z.uuid(),
  profissionalNome: z.string().nullable(),
  /** Atendimento de origem, quando houver (a Nova Prescricao desta tela não tem atendimento). */
  atendimentoId: z.uuid().nullable(),
  medicacao: z.string(),
  posologia: z.string().nullable(),
  dataPrescricao: z.iso.date(),
  createdAt: z.iso.datetime(),
});
export type Prescricao = z.infer<typeof prescricaoSchema>;

export const prescricaoPageSchema = paginatedResponseSchema(prescricaoSchema);
export type PrescricaoPage = z.infer<typeof prescricaoPageSchema>;
