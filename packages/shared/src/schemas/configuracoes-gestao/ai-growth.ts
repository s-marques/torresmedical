import { z } from 'zod';

/**
 * Tipos de insight da tela AI Growth (`/ai-growth`). O texto de cada um é montado no front, a
 * partir do tipo e dos números (`quantidade` e `parametros`), para sair no idioma do usuário.
 */
export const AI_GROWTH_TIPOS = [
  'PACIENTES_INATIVOS',
  'PACIENTES_PENDENTES_RETORNO',
  'FAIXAS_BAIXA_OCUPACAO',
  'FALTAS_RECENTES',
  'PROFISSIONAIS_SUBUTILIZADOS',
  'ANIVERSARIANTES_PROXIMOS',
  'INATIVOS_POR_PROFISSIONAL',
] as const;

export const aiGrowthTipoSchema = z.enum(AI_GROWTH_TIPOS);
export type AiGrowthTipo = z.infer<typeof aiGrowthTipoSchema>;

export const AI_GROWTH_PRIORIDADES = ['BAIXA', 'MEDIA', 'ALTA'] as const;
export const aiGrowthPrioridadeSchema = z.enum(AI_GROWTH_PRIORIDADES);
export type AiGrowthPrioridade = z.infer<typeof aiGrowthPrioridadeSchema>;

export const AI_GROWTH_STATUS_ANALISE = ['PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'FALHOU'] as const;
export const aiGrowthStatusAnaliseSchema = z.enum(AI_GROWTH_STATUS_ANALISE);
export type AiGrowthStatusAnalise = z.infer<typeof aiGrowthStatusAnaliseSchema>;

/** Janelas e limites das regras (docs: valores dos prints do inventário). */
export const AI_GROWTH_DIAS_INATIVO = 60;
export const AI_GROWTH_DIAS_FALTAS = 90;
export const AI_GROWTH_DIAS_ANIVERSARIO = 7;
export const AI_GROWTH_DIAS_PRODUTIVIDADE = 30;
export const AI_GROWTH_OCUPACAO_MINIMA = 0.5;
/** A partir daqui o insight sobe de prioridade média para alta. */
export const AI_GROWTH_LIMITE_ALTA = 10;

/** Números que o texto do insight usa. Nunca guarda nome, telefone ou outro dado pessoal. */
export const aiGrowthParametrosSchema = z.object({
  media: z.number().optional(),
  faturado: z.number().optional(),
  dias: z.number().optional(),
});
export type AiGrowthParametros = z.infer<typeof aiGrowthParametrosSchema>;

export const aiGrowthInsightSchema = z.object({
  id: z.uuid(),
  tipo: aiGrowthTipoSchema,
  prioridade: aiGrowthPrioridadeSchema,
  /** Quantos itens a regra encontrou; 0 = "sem pendências". */
  quantidade: z.number().int().min(0),
  parametros: aiGrowthParametrosSchema,
});
export type AiGrowthInsight = z.infer<typeof aiGrowthInsightSchema>;

export const aiGrowthAnaliseSchema = z.object({
  id: z.uuid(),
  status: aiGrowthStatusAnaliseSchema,
  solicitadaEm: z.iso.datetime(),
  concluidaEm: z.iso.datetime().nullable(),
});
export type AiGrowthAnalise = z.infer<typeof aiGrowthAnaliseSchema>;

/** Resposta de `GET /api/configuracoes-gestao/ai-growth`. */
export const aiGrowthPainelSchema = z.object({
  /** Última análise concluída (a que os insights mostram); nula antes da primeira. */
  ultimaAnalise: aiGrowthAnaliseSchema.nullable(),
  /** Análise em andamento (pendente ou processando), se houver. */
  emAndamento: aiGrowthAnaliseSchema.nullable(),
  insights: z.array(aiGrowthInsightSchema),
  /** Total de pontos de atenção ("7 pontos de atenção"). */
  pontosAtencao: z.number().int().min(0),
});
export type AiGrowthPainel = z.infer<typeof aiGrowthPainelSchema>;

/** Prioridade pela quantidade encontrada: nada = baixa; muitos = alta; o resto, média. */
export function prioridadeAiGrowth(quantidade: number): AiGrowthPrioridade {
  if (quantidade <= 0) return 'BAIXA';
  return quantidade >= AI_GROWTH_LIMITE_ALTA ? 'ALTA' : 'MEDIA';
}
