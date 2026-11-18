import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';

/**
 * Pesquisa NPS (tela Pesquisa NPS, `/pesquisa-satisfacao`): pergunta ao paciente, pelo WhatsApp,
 * quanto ele recomendaria a clínica (nota de 0 a 10) depois do atendimento finalizado.
 * Abas Dashboard e Respostas; o período (De/Até) vale para as duas, e para os cartões também.
 */

export const NPS_NOTA_MIN = 0;
export const NPS_NOTA_MAX = 10;
export const NPS_COMENTARIO_MAX = 1000;

/** Período padrão do filtro (De = hoje menos 30 dias), como no legado. */
export const NPS_PERIODO_PADRAO_DIAS = 30;

export const NPS_STATUS = ['ENVIADA', 'RESPONDIDA', 'FALHA'] as const;
export type NpsStatus = (typeof NPS_STATUS)[number];
export const NPS_STATUS_ROTULO: Readonly<Record<NpsStatus, string>> = {
  ENVIADA: 'Aguardando resposta',
  RESPONDIDA: 'Respondida',
  FALHA: 'Falha no envio',
};

export const NPS_CLASSIFICACOES = ['PROMOTOR', 'NEUTRO', 'DETRATOR'] as const;
export type NpsClassificacao = (typeof NPS_CLASSIFICACOES)[number];
export const NPS_CLASSIFICACAO_ROTULO: Readonly<Record<NpsClassificacao, string>> = {
  PROMOTOR: 'Promotor',
  NEUTRO: 'Neutro',
  DETRATOR: 'Detrator',
};

/** Faixas padrão do NPS: 9–10 promotor, 7–8 neutro, 0–6 detrator. */
export function classificarNota(nota: number): NpsClassificacao {
  if (nota >= 9) return 'PROMOTOR';
  if (nota >= 7) return 'NEUTRO';
  return 'DETRATOR';
}

/** Score = % de promotores − % de detratores, arredondado. Sem avaliações, 0. */
export function calcularScoreNps(contagem: {
  promotores: number;
  neutros: number;
  detratores: number;
}): number {
  const total = contagem.promotores + contagem.neutros + contagem.detratores;
  if (total === 0) return 0;
  return Math.round(((contagem.promotores - contagem.detratores) / total) * 100);
}

/** Percentual inteiro de `parte` sobre `total` (0 quando não há total). */
export function percentual(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((parte / total) * 100);
}

/** Texto abaixo do score. */
export function faixaDoScore(score: number): string {
  if (score >= 75) return 'Excelente';
  if (score >= 50) return 'Muito bom';
  if (score >= 0) return 'Razoavel';
  return 'Critico';
}

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Data inválida' });

/** Período De/Até (inclusive), em dias da clínica. Ausente: últimos 30 dias até hoje. */
export const periodoNpsSchema = z.object({ de: dia.optional(), ate: dia.optional() });
export type PeriodoNps = z.infer<typeof periodoNpsSchema>;

// ---------- Dashboard ----------

export const resumoNpsQuerySchema = periodoNpsSchema;
export type ResumoNpsQuery = z.infer<typeof resumoNpsQuerySchema>;

const contagem = z.number().int().nonnegative();

export const resumoNpsSchema = z.object({
  /** Período efetivamente usado (com os padrões aplicados). */
  de: dia,
  ate: dia,
  score: z.number().int().min(-100).max(100),
  enviadas: contagem,
  respondidas: contagem,
  /** % de respondidas sobre enviadas. */
  taxaResposta: z.number().int().min(0).max(100),
  avaliacoes: contagem,
  promotores: contagem,
  neutros: contagem,
  detratores: contagem,
  percentualPromotores: z.number().int().min(0).max(100),
  percentualNeutros: z.number().int().min(0).max(100),
  percentualDetratores: z.number().int().min(0).max(100),
});
export type ResumoNps = z.infer<typeof resumoNpsSchema>;

// ---------- Respostas ----------

export const pesquisaNpsSchema = z.object({
  id: z.uuid(),
  paciente: z.string(),
  profissional: z.string(),
  status: z.enum(NPS_STATUS),
  nota: z.number().int().min(NPS_NOTA_MIN).max(NPS_NOTA_MAX).nullable(),
  classificacao: z.enum(NPS_CLASSIFICACOES).nullable(),
  comentario: z.string().nullable(),
  enviadaEm: z.iso.datetime(),
  respondidaEm: z.iso.datetime().nullable(),
});
export type PesquisaNps = z.infer<typeof pesquisaNpsSchema>;

export const pesquisaNpsPageSchema = paginatedResponseSchema(pesquisaNpsSchema);
export type PesquisaNpsPage = z.infer<typeof pesquisaNpsPageSchema>;

export const NPS_SORT_FIELDS = [
  'enviadaEm',
  'respondidaEm',
  'paciente',
  'profissional',
  'nota',
] as const;

/** `GET /pesquisa-nps`: período, classificação e busca por paciente ou profissional. */
export const listPesquisasNpsQuerySchema = listQuerySchema({
  sortFields: NPS_SORT_FIELDS,
  defaultSort: 'enviadaEm:desc',
  filters: {
    de: dia.optional(),
    ate: dia.optional(),
    classificacao: z.enum(NPS_CLASSIFICACOES).optional(),
  },
});
export type ListPesquisasNpsQuery = z.infer<typeof listPesquisasNpsQuerySchema>;

// ---------- Resposta do paciente (integração do WhatsApp) ----------

export const respostaNpsInputSchema = z.strictObject({
  nota: z
    .number({ error: 'A nota é obrigatória.' })
    .int({ error: 'A nota deve ser um número inteiro' })
    .min(NPS_NOTA_MIN, { error: 'A nota deve estar entre 0 e 10' })
    .max(NPS_NOTA_MAX, { error: 'A nota deve estar entre 0 e 10' }),
  comentario: z
    .string()
    .trim()
    .max(NPS_COMENTARIO_MAX, {
      error: `O comentário deve ter até ${NPS_COMENTARIO_MAX} caracteres`,
    })
    .optional()
    .transform((v) => v || undefined),
});
export type RespostaNpsInput = z.output<typeof respostaNpsInputSchema>;

/** Texto enviado ao paciente (variáveis `{nome}` e `{profissional}`). */
export const NPS_MENSAGEM_PADRAO =
  'Olá {nome}! Como foi seu atendimento com {profissional}? De 0 a 10, qual a chance de você recomendar a nossa clínica a um amigo ou familiar? Responda apenas com o número.';

export function aplicarVariaveisNps(
  texto: string,
  dados: { nome: string; profissional: string },
): string {
  return texto.replaceAll('{nome}', dados.nome).replaceAll('{profissional}', dados.profissional);
}
