import { z } from 'zod';
import {
  dataSchemaOpcional,
  PERIODO_CONSULTA_INVALIDO,
} from '../comercial-atendimento/periodo-vendas';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { erroObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

// Encaminhamento de pacientes entre profissionais (issue #146; R §26 e §14). O encaminhamento
// guarda só quem indica, quem recebe e o motivo: nenhum dado clínico vai para o destino.

export const ENCAMINHAMENTO_MOTIVO_MAX = 500;

/**
 * Situação do encaminhamento. É derivada (decisão do dev na #146): ATENDIDO quando há atendimento
 * finalizado do paciente com o profissional de destino a partir da data do encaminhamento;
 * AGENDADO quando há agendamento ativo; senão ENCAMINHADO.
 */
export const ENCAMINHAMENTO_SITUACOES = ['ENCAMINHADO', 'AGENDADO', 'ATENDIDO'] as const;
export const encaminhamentoSituacaoSchema = z.enum(ENCAMINHAMENTO_SITUACOES, {
  error: 'Situação inválida',
});
export type EncaminhamentoSituacao = z.infer<typeof encaminhamentoSituacaoSchema>;
export const ENCAMINHAMENTO_SITUACAO_ROTULOS: Readonly<Record<EncaminhamentoSituacao, string>> = {
  ENCAMINHADO: 'Encaminhado',
  AGENDADO: 'Agendado',
  ATENDIDO: 'Atendido',
};

export const ORIGEM_IGUAL_DESTINO = 'Origem e destino devem ser profissionais diferentes';

const idObrigatorio = (rotulo: string) =>
  z
    .string({ error: erroObrigatorio(rotulo) })
    .min(1, { error: erroObrigatorio(rotulo) })
    .pipe(z.uuid({ error: `${rotulo} inválido` }));

const idOpcional = (rotulo: string) =>
  z
    .string({ error: `${rotulo} inválida` })
    .nullish()
    .transform((valor) => valor || null)
    .pipe(z.uuid({ error: `${rotulo} inválida` }).nullable());

const dataOpcional = (rotulo: string) =>
  z
    .string({ error: `${rotulo} inválida` })
    .nullish()
    .transform((valor) => valor || null)
    .pipe(z.iso.date({ error: `${rotulo} inválida` }).nullable());

const periodoCoerente = <T extends { de?: string | undefined; ate?: string | undefined }>(
  consulta: T,
) => !consulta.de || !consulta.ate || consulta.de <= consulta.ate;

// --- Formulário --------------------------------------------------------------------------

/**
 * `POST/PATCH /api/consultorio-assistencial/encaminhamentos`. Registrado pelo profissional de
 * origem ou pela recepção (decisão do dev na #146). Vazio em `data`: o servidor grava hoje.
 */
export const encaminhamentoInputSchema = z
  .strictObject({
    pacienteId: idObrigatorio('Paciente'),
    origemProfissionalId: idObrigatorio('Profissional de origem'),
    destinoProfissionalId: idObrigatorio('Profissional de destino'),
    especialidadeId: idOpcional('Especialidade'),
    data: dataOpcional('Data'),
    motivo: z
      .string({ error: 'Motivo inválido' })
      .trim()
      .max(ENCAMINHAMENTO_MOTIVO_MAX, {
        error: `Motivo deve ter no máximo ${ENCAMINHAMENTO_MOTIVO_MAX} caracteres`,
      })
      .nullish()
      .transform((valor) => valor || null),
  })
  .refine(
    // Campos vazios já têm a mensagem de obrigatório; só compara quando há valor.
    (dados) =>
      !dados.origemProfissionalId || dados.origemProfissionalId !== dados.destinoProfissionalId,
    { error: ORIGEM_IGUAL_DESTINO, path: ['destinoProfissionalId'] },
  );
export type EncaminhamentoFormulario = z.input<typeof encaminhamentoInputSchema>;
export type CreateEncaminhamentoInput = z.output<typeof encaminhamentoInputSchema>;
export type UpdateEncaminhamentoInput = CreateEncaminhamentoInput;
export const createEncaminhamentoSchema = encaminhamentoInputSchema;
export const updateEncaminhamentoSchema = encaminhamentoInputSchema;

// --- Listagem ----------------------------------------------------------------------------

export const ENCAMINHAMENTO_SORT_FIELDS = [
  'data',
  'paciente',
  'origem',
  'destino',
  'especialidade',
  'situacao',
] as const;
export type EncaminhamentoSortField = (typeof ENCAMINHAMENTO_SORT_FIELDS)[number];

const filtrosEncaminhamento = {
  /** Chips Todos/Encaminhado/Agendado/Atendido. */
  situacao: encaminhamentoSituacaoSchema.optional(),
  /** Enviados por este profissional. */
  origemProfissionalId: z.uuid({ error: 'Profissional inválido' }).optional(),
  /** Recebidos por este profissional. */
  destinoProfissionalId: z.uuid({ error: 'Profissional inválido' }).optional(),
  /** Período De/Até da data do encaminhamento (`AAAA-MM-DD`), ambos opcionais. */
  de: dataSchemaOpcional('inicial'),
  ate: dataSchemaOpcional('final'),
};

/** `GET /api/consultorio-assistencial/encaminhamentos`. */
export const listEncaminhamentosQuerySchema = listQuerySchema({
  sortFields: ENCAMINHAMENTO_SORT_FIELDS,
  defaultSort: 'data:desc',
  filters: filtrosEncaminhamento,
}).refine(periodoCoerente, { error: PERIODO_CONSULTA_INVALIDO, path: ['ate'] });
export type ListEncaminhamentosQuery = z.infer<typeof listEncaminhamentosQuerySchema>;

export const ENCAMINHAMENTO_EXPORT_COLUMNS = ENCAMINHAMENTO_SORT_FIELDS;
export type EncaminhamentoExportColumn = (typeof ENCAMINHAMENTO_EXPORT_COLUMNS)[number];

/** `GET /api/consultorio-assistencial/encaminhamentos/export`. */
export const exportEncaminhamentosQuerySchema = exportQuerySchema(
  z.object({
    sort: listEncaminhamentosQuerySchema.shape.sort,
    search: listEncaminhamentosQuerySchema.shape.search,
    ...filtrosEncaminhamento,
  }),
  ENCAMINHAMENTO_EXPORT_COLUMNS,
).refine(periodoCoerente, { error: PERIODO_CONSULTA_INVALIDO, path: ['ate'] });
export type ExportEncaminhamentosQuery = z.infer<typeof exportEncaminhamentosQuerySchema>;

export const encaminhamentoSchema = z.object({
  id: z.uuid(),
  pacienteId: z.uuid(),
  /** Só o nome: o destino não vê nenhum dado clínico (R §14). */
  pacienteNome: z.string().nullable(),
  origemProfissionalId: z.uuid(),
  origemProfissionalNome: z.string().nullable(),
  destinoProfissionalId: z.uuid(),
  destinoProfissionalNome: z.string().nullable(),
  especialidadeId: z.uuid().nullable(),
  especialidadeNome: z.string().nullable(),
  data: z.iso.date(),
  motivo: z.string().nullable(),
  situacao: encaminhamentoSituacaoSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Encaminhamento = z.infer<typeof encaminhamentoSchema>;

export const encaminhamentoPageSchema = paginatedResponseSchema(encaminhamentoSchema);
export type EncaminhamentoPage = z.infer<typeof encaminhamentoPageSchema>;

// --- Profissionais selecionáveis ---------------------------------------------------------

export const encaminhamentoProfissionalSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  descricao: z.string().nullable(),
});
export type EncaminhamentoProfissional = z.infer<typeof encaminhamentoProfissionalSchema>;

/**
 * `GET .../encaminhamentos/profissionais`: só profissionais com contrato de sala ativo que
 * permite indicação. `origens` respeita o escopo do usuário; `destinos` traz todos.
 */
export const encaminhamentoProfissionaisSchema = z.object({
  origens: z.array(encaminhamentoProfissionalSchema),
  destinos: z.array(encaminhamentoProfissionalSchema),
});
export type EncaminhamentoProfissionais = z.infer<typeof encaminhamentoProfissionaisSchema>;

// --- Relatório por profissional ----------------------------------------------------------

export const ENCAMINHAMENTO_RELATORIO_SORT_FIELDS = [
  'profissional',
  'enviados',
  'enviadosAtendidos',
  'taxaEnviados',
  'recebidos',
  'recebidosAtendidos',
  'taxaRecebidos',
] as const;
export type EncaminhamentoRelatorioSortField =
  (typeof ENCAMINHAMENTO_RELATORIO_SORT_FIELDS)[number];

/** `GET .../encaminhamentos/relatorio`: período De/Até opcional da data do encaminhamento. */
export const relatorioEncaminhamentosQuerySchema = listQuerySchema({
  sortFields: ENCAMINHAMENTO_RELATORIO_SORT_FIELDS,
  defaultSort: 'profissional:asc',
  filters: { de: dataSchemaOpcional('inicial'), ate: dataSchemaOpcional('final') },
}).refine(periodoCoerente, { error: PERIODO_CONSULTA_INVALIDO, path: ['ate'] });
export type RelatorioEncaminhamentosQuery = z.infer<typeof relatorioEncaminhamentosQuerySchema>;

/**
 * Uma linha por profissional. Conversão = encaminhamentos atendidos / total, em percentual com
 * uma casa (0 quando não há encaminhamentos).
 */
export const encaminhamentoRelatorioLinhaSchema = z.object({
  profissionalId: z.uuid(),
  profissionalNome: z.string().nullable(),
  enviados: z.number().int(),
  enviadosAtendidos: z.number().int(),
  taxaEnviados: z.number(),
  recebidos: z.number().int(),
  recebidosAtendidos: z.number().int(),
  taxaRecebidos: z.number(),
});
export type EncaminhamentoRelatorioLinha = z.infer<typeof encaminhamentoRelatorioLinhaSchema>;

export const encaminhamentoRelatorioPageSchema = paginatedResponseSchema(
  encaminhamentoRelatorioLinhaSchema,
);
export type EncaminhamentoRelatorioPage = z.infer<typeof encaminhamentoRelatorioPageSchema>;
