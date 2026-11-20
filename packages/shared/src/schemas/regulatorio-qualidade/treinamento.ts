import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { erroObrigatorio, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';

/**
 * Tela Treinamentos (`/treinamentos`): controle de treinamentos e certificações dos funcionários.
 * Abas: Todos, Válido e Vencido.
 *
 * Decisões confirmadas pelo dev na issue #70: o Tipo vem de uma tabela editável (como os tipos de
 * licença); o status é calculado pela Data Vencimento (sem vencimento, é Válido); só há cadastro e
 * listagem (o inventário não mostra editar nem excluir); as mensagens de campo obrigatório seguem
 * o padrão "<Campo> é obrigatório.".
 */
export const TREINAMENTO_STATUS = ['valido', 'vencido'] as const;
export const treinamentoStatusSchema = z.enum(TREINAMENTO_STATUS);
export type TreinamentoStatus = z.infer<typeof treinamentoStatusSchema>;

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

// ──────────────────────────────── Tipo de treinamento (combo "Tipo") ──────────────────────────────

export const TIPO_TREINAMENTO_NOME_MAX = 150;

/** Corpo de `POST /api/regulatorio-qualidade/tipos-treinamento`. Só o Nome é obrigatório. */
export const tipoTreinamentoInputSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: TIPO_TREINAMENTO_NOME_MAX }),
});
export type TipoTreinamentoFormInput = z.input<typeof tipoTreinamentoInputSchema>;
export type CreateTipoTreinamentoInput = z.output<typeof tipoTreinamentoInputSchema>;
export const createTipoTreinamentoSchema = tipoTreinamentoInputSchema;

export const tipoTreinamentoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  createdAt: z.iso.datetime(),
});
export type TipoTreinamento = z.infer<typeof tipoTreinamentoSchema>;
export const tipoTreinamentoListSchema = z.array(tipoTreinamentoSchema);

// ───────────────────────────── Treinamento (modal "Novo Treinamento") ─────────────────────────────

const cargaHoraria = z
  .union([z.literal(''), z.number(), z.string()])
  .nullish()
  .transform((valor, ctx) => {
    if (valor === null || valor === undefined || valor === '') return null;
    const numero = typeof valor === 'number' ? valor : Number(valor.replace(',', '.'));
    if (!Number.isInteger(numero) || numero < 0 || numero > 9999) {
      ctx.addIssue({ code: 'custom', message: 'Carga Horária (h) inválida' });
      return z.NEVER;
    }
    return numero;
  });

/** Corpo de `POST /api/regulatorio-qualidade/treinamentos`. Obrigatórios: Funcionário e Tipo. */
export const treinamentoInputSchema = z.strictObject({
  funcionarioId: z.uuid({ error: erroObrigatorio('Funcionário') }),
  tipoTreinamentoId: z.uuid({ error: erroObrigatorio('Tipo') }),
  descricao: textoOpcional(2000, 'Descrição'),
  dataRealizacao: dataOpcional('Data Realização'),
  dataVencimento: dataOpcional('Data Vencimento'),
  cargaHoraria,
  instituicao: textoOpcional(150, 'Instituição'),
  observacoes: textoOpcional(2000, 'Observações'),
});

export type TreinamentoFormInput = z.input<typeof treinamentoInputSchema>;
export type CreateTreinamentoInput = z.output<typeof treinamentoInputSchema>;
export const createTreinamentoSchema = treinamentoInputSchema;

export const TREINAMENTO_SORT_FIELDS = [
  'funcionario',
  'tipo',
  'dataRealizacao',
  'dataVencimento',
  'instituicao',
  'status',
] as const;

export const listTreinamentosQuerySchema = listQuerySchema({
  sortFields: TREINAMENTO_SORT_FIELDS,
  defaultSort: 'dataVencimento:desc',
  filters: { status: treinamentoStatusSchema.optional() },
});
export type ListTreinamentosQuery = z.infer<typeof listTreinamentosQuerySchema>;

export const TREINAMENTO_EXPORT_COLUMNS = TREINAMENTO_SORT_FIELDS;
export type TreinamentoExportColumn = (typeof TREINAMENTO_EXPORT_COLUMNS)[number];

export const exportTreinamentosQuerySchema = exportQuerySchema(
  listTreinamentosQuerySchema,
  TREINAMENTO_EXPORT_COLUMNS,
);
export type ExportTreinamentosQuery = z.infer<typeof exportTreinamentosQuerySchema>;

const texto = z.string().nullable();

export const treinamentoSchema = z.object({
  id: z.uuid(),
  funcionarioId: z.uuid(),
  funcionarioNome: z.string(),
  tipoTreinamentoId: z.uuid(),
  tipoNome: z.string(),
  descricao: texto,
  /** `YYYY-MM-DD`. */
  dataRealizacao: texto,
  /** `YYYY-MM-DD`. */
  dataVencimento: texto,
  cargaHoraria: z.number().int().nullable(),
  instituicao: texto,
  observacoes: texto,
  status: treinamentoStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Treinamento = z.infer<typeof treinamentoSchema>;

export const treinamentoPageSchema = paginatedResponseSchema(treinamentoSchema);
export type TreinamentoPage = z.infer<typeof treinamentoPageSchema>;
