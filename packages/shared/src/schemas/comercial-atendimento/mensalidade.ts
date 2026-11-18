import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { mensagemObrigatoria, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';
import {
  competenciaSchema,
  formatarCompetencia,
} from '../gestao-profissionais/contrato-sala-cobranca';

/**
 * Tela Mensalidades (`/mensalidades`, issue #6): cobranças recorrentes mensais de pacientes. Os
 * contratos de sala têm a própria rotina de cobrança (#115) e não passam por aqui.
 */

export const MENSALIDADE_DESCRICAO_MAX = 200;
export const MENSALIDADE_OBSERVACOES_MAX = 2000;
/** Cabe em DECIMAL(12,2). */
export const MENSALIDADE_VALOR_MAX = 999_999_999;
/** Placeholder "1-28" do modal: todo mês tem o dia, sem ajuste de fim de mês. */
export const MENSALIDADE_DIA_MIN = 1;
export const MENSALIDADE_DIA_MAX = 28;

/** Abas do inventário: Todos (ausente) / Ativo / Pausado / Cancelado. */
export const MENSALIDADE_STATUS = ['ATIVO', 'PAUSADO', 'CANCELADO'] as const;
export const mensalidadeStatusSchema = z.enum(MENSALIDADE_STATUS, { error: 'Status inválido' });
export type MensalidadeStatus = (typeof MENSALIDADE_STATUS)[number];

export const MENSALIDADE_ROTULO_STATUS: Readonly<Record<MensalidadeStatus, string>> = {
  ATIVO: 'Ativo',
  PAUSADO: 'Pausado',
  CANCELADO: 'Cancelado',
};

/**
 * Mudanças de status permitidas pelos botões da linha (confirmado pelo dev): Pausar (Ativo →
 * Pausado), Reativar (Pausado → Ativo) e Cancelar (Ativo/Pausado → Cancelado). Cancelado é final.
 */
export const MENSALIDADE_TRANSICOES: Readonly<
  Record<MensalidadeStatus, readonly MensalidadeStatus[]>
> = {
  ATIVO: ['PAUSADO', 'CANCELADO'],
  PAUSADO: ['ATIVO', 'CANCELADO'],
  CANCELADO: [],
};

export function podeMudarStatusMensalidade(
  de: MensalidadeStatus,
  para: MensalidadeStatus,
): boolean {
  return MENSALIDADE_TRANSICOES[de].includes(para);
}

const dataObrigatoria = (rotulo: string) =>
  z
    .string({ error: mensagemObrigatoria(rotulo, 'f') })
    .trim()
    .min(1, { error: mensagemObrigatoria(rotulo, 'f') })
    .pipe(z.iso.date({ error: `${rotulo} inválida` }));

const dataOpcional = (rotulo: string) =>
  z
    .union([z.iso.date({ error: `${rotulo} inválida` }), z.literal(''), z.null()])
    .optional()
    .transform((valor) => valor || null);

/**
 * `POST /api/comercial-atendimento/mensalidades` e `PATCH /:id`: modal "Nova Mensalidade".
 * Obrigatórios (asterisco no print): Cliente, Descrição, Valor, Dia Vencimento e Data Início.
 */
export const mensalidadeInputSchema = z
  .strictObject({
    pacienteId: z.uuid({ error: mensagemObrigatoria('Cliente') }),
    descricao: textoObrigatorio('Descrição', { genero: 'f', max: MENSALIDADE_DESCRICAO_MAX }),
    valor: z
      .number({ error: mensagemObrigatoria('Valor') })
      .positive({ error: 'O valor deve ser maior que zero' })
      .max(MENSALIDADE_VALOR_MAX, { error: 'Valor inválido' }),
    diaVencimento: z
      .number({ error: mensagemObrigatoria('Dia de vencimento') })
      .int({ error: 'Informe um dia de 1 a 28' })
      .min(MENSALIDADE_DIA_MIN, { error: 'Informe um dia de 1 a 28' })
      .max(MENSALIDADE_DIA_MAX, { error: 'Informe um dia de 1 a 28' }),
    formaPagamentoId: z
      .uuid({ error: 'Forma de pagamento inválida' })
      .nullish()
      .transform((valor) => valor ?? null),
    dataInicio: dataObrigatoria('Data de início'),
    dataFim: dataOpcional('Data de fim'),
    observacoes: z
      .string({ error: 'Observações inválidas' })
      .trim()
      .max(MENSALIDADE_OBSERVACOES_MAX, {
        error: `Observações devem ter no máximo ${MENSALIDADE_OBSERVACOES_MAX} caracteres`,
      })
      .nullish()
      .transform((valor) => valor || null),
  })
  .refine((m) => !m.dataFim || m.dataFim >= m.dataInicio, {
    error: 'A data de fim não pode ser anterior à data de início',
    path: ['dataFim'],
  });
export type MensalidadeInput = z.output<typeof mensalidadeInputSchema>;
export type MensalidadeFormulario = z.input<typeof mensalidadeInputSchema>;

/** `PATCH /api/comercial-atendimento/mensalidades/:id/status`: Pausar, Reativar e Cancelar. */
export const mudarStatusMensalidadeSchema = z.strictObject({
  status: mensalidadeStatusSchema,
});
export type MudarStatusMensalidadeInput = z.infer<typeof mudarStatusMensalidadeSchema>;

/** Campos de `sort=`, um por coluna do grid. */
export const MENSALIDADE_SORT_FIELDS = [
  'cliente',
  'descricao',
  'valor',
  'diaVencimento',
  'dataInicio',
  'dataFim',
  'status',
  'criacao',
] as const;

/** `GET /api/comercial-atendimento/mensalidades`. */
export const listMensalidadesQuerySchema = listQuerySchema({
  sortFields: MENSALIDADE_SORT_FIELDS,
  defaultSort: 'criacao:desc',
  filters: { status: mensalidadeStatusSchema.optional() },
});
export type ListMensalidadesQuery = z.infer<typeof listMensalidadesQuerySchema>;

export const MENSALIDADE_EXPORT_COLUMNS = [
  'cliente',
  'descricao',
  'valor',
  'diaVencimento',
  'dataInicio',
  'dataFim',
  'status',
] as const;
export type MensalidadeExportColumn = (typeof MENSALIDADE_EXPORT_COLUMNS)[number];

/** `GET /api/comercial-atendimento/mensalidades/export`. */
export const exportMensalidadesQuerySchema = exportQuerySchema(
  listMensalidadesQuerySchema,
  MENSALIDADE_EXPORT_COLUMNS,
);
export type ExportMensalidadesQuery = z.infer<typeof exportMensalidadesQuerySchema>;

export const mensalidadeSchema = z.object({
  id: z.uuid(),
  pacienteId: z.uuid(),
  /** Coluna "Cliente". */
  cliente: z.string(),
  descricao: z.string(),
  /** Texto decimal exato do banco (ex.: `"150.00"`). */
  valor: z.string(),
  diaVencimento: z.number().int(),
  formaPagamentoId: z.uuid().nullable(),
  /** `AAAA-MM-DD`. */
  dataInicio: z.string(),
  /** `AAAA-MM-DD`. */
  dataFim: z.string().nullable(),
  observacoes: z.string().nullable(),
  status: mensalidadeStatusSchema,
});
export type Mensalidade = z.infer<typeof mensalidadeSchema>;

export const mensalidadePageSchema = paginatedResponseSchema(mensalidadeSchema);
export type MensalidadePage = z.infer<typeof mensalidadePageSchema>;

/**
 * `POST /api/comercial-atendimento/mensalidades/gerar-titulos` (modal "Gerar Titulos do Mes",
 * print do dev): o mês e o ano escolhidos viram a competência `AAAA-MM`.
 */
export const gerarTitulosMensalidadesSchema = z.strictObject({
  competencia: competenciaSchema,
});
export type GerarTitulosMensalidadesInput = z.infer<typeof gerarTitulosMensalidadesSchema>;

export const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

/** Formulário do modal: selects Mês (`01`–`12`) e Ano (`AAAA`), enviados como `competencia`. */
export const gerarTitulosMensalidadesFormularioSchema = z
  .object({
    mes: z
      .string({ error: mensagemObrigatoria('Mês') })
      .regex(/^(0[1-9]|1[0-2])$/, { error: mensagemObrigatoria('Mês') }),
    ano: z
      .string({ error: mensagemObrigatoria('Ano') })
      .regex(/^\d{4}$/, { error: mensagemObrigatoria('Ano') }),
  })
  .transform(({ mes, ano }): GerarTitulosMensalidadesInput => ({ competencia: `${ano}-${mes}` }));
export type GerarTitulosMensalidadesFormulario = z.input<
  typeof gerarTitulosMensalidadesFormularioSchema
>;

export const gerarTitulosMensalidadesResumoSchema = z.object({
  competencia: z.string(),
  geradas: z.number().int(),
  jaExistentes: z.number().int(),
});
export type GerarTitulosMensalidadesResumo = z.infer<typeof gerarTitulosMensalidadesResumoSchema>;

/** Aviso do resultado: "3 título(s) gerado(s) para 11/2026; 2 mensalidade(s) já tinham título no mês." */
export function descreverResumoGerarTitulos(resumo: GerarTitulosMensalidadesResumo): string {
  return (
    `${resumo.geradas} título(s) gerado(s) para ${formatarCompetencia(resumo.competencia)}; ` +
    `${resumo.jaExistentes} mensalidade(s) já tinham título no mês.`
  );
}

/** Descrição do título gerado em Contas a Receber. */
export function descricaoTituloMensalidade(descricao: string): string {
  return `Mensalidade - ${descricao}`;
}

/** Último dia (`AAAA-MM-DD`) do mês de competência `AAAA-MM`. */
function ultimoDiaCompetencia(competencia: string): string {
  const [ano = 0, mes = 1] = competencia.split('-').map(Number);
  const dia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${competencia}-${String(dia).padStart(2, '0')}`;
}

/** A mensalidade está vigente em algum dia do mês (Data Início ≤ fim do mês e Data Fim ≥ início)? */
export function mensalidadeVigenteNaCompetencia(
  mensalidade: { dataInicio: string; dataFim: string | null },
  competencia: string,
): boolean {
  const inicioMes = `${competencia}-01`;
  const fimMes = ultimoDiaCompetencia(competencia);
  return (
    mensalidade.dataInicio <= fimMes &&
    (mensalidade.dataFim === null || mensalidade.dataFim >= inicioMes)
  );
}

/** Vencimento do título: o "Dia Venc." da mensalidade no mês de competência. */
export function vencimentoTituloMensalidade(competencia: string, diaVencimento: number): string {
  return `${competencia}-${String(diaVencimento).padStart(2, '0')}`;
}
