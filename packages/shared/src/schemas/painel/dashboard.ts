import { z } from 'zod';
import { matrizTurnoSchema } from '../comercial-atendimento/agenda-matriz';

/** Abas do dashboard, na ordem da tela (docs/inventario/telas/painel-painel.md). */
export const ABAS_PAINEL = [
  'hoje',
  'executivo',
  'comercial',
  'ocupacao',
  'financeiro',
  'pacientes',
] as const;
export type AbaPainel = (typeof ABAS_PAINEL)[number];
export const abaPainelSchema = z.enum(ABAS_PAINEL, { error: 'Aba inválida' });

/** Dropdown "Por mês" / "Por período". */
export const MODOS_PERIODO = ['mes', 'periodo'] as const;
export type ModoPeriodo = (typeof MODOS_PERIODO)[number];

/** Dropdown "Recebimento" / "Competência". */
export const BASES_PERIODO = ['recebimento', 'competencia'] as const;
export type BasePeriodo = (typeof BASES_PERIODO)[number];

export const PERIODO_PAINEL_INVALIDO = 'A data inicial deve ser anterior ou igual à final';

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

function dataValida(valor: string): boolean {
  const partes = DATA.exec(valor);
  if (!partes) return false;
  const [ano, mes, dia] = partes.slice(1).map(Number) as [number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  );
}

/**
 * Filtros do topo do dashboard. Em `mes`, vale `mes` (`AAAA-MM`; vazio = mês atual). Em `periodo`,
 * valem `de` e `ate` (`AAAA-MM-DD`), obrigatórios.
 */
export const filtrosPainelSchema = z
  .object({
    modo: z.enum(MODOS_PERIODO, { error: 'Modo de período inválido' }).default('mes'),
    mes: z
      .string()
      .trim()
      .regex(MES, { error: 'Mês inválido' })
      .optional()
      .or(z.literal('').transform(() => undefined)),
    de: z.string().trim().optional(),
    ate: z.string().trim().optional(),
    base: z.enum(BASES_PERIODO, { error: 'Base inválida' }).default('recebimento'),
    // Filtros da aba Ocupação (issue #139): sala, profissional, turno e dia da semana.
    salaId: z.uuid({ error: 'Sala inválida' }).optional(),
    profissionalId: z.uuid({ error: 'Profissional inválido' }).optional(),
    turno: matrizTurnoSchema.optional(),
    /** Dia da semana: 0 = domingo … 6 = sábado. */
    diaSemana: z
      .string({ error: 'Dia da semana inválido' })
      .regex(/^[0-6]$/, { error: 'Dia da semana inválido' })
      .transform(Number)
      .optional(),
  })
  .superRefine((filtros, ctx) => {
    if (filtros.modo !== 'periodo') return;
    for (const campo of ['de', 'ate'] as const) {
      const rotulo = campo === 'de' ? 'inicial' : 'final';
      const valor = filtros[campo];
      if (!valor)
        ctx.addIssue({ code: 'custom', path: [campo], message: `Informe a data ${rotulo}` });
      else if (!dataValida(valor))
        ctx.addIssue({ code: 'custom', path: [campo], message: `Data ${rotulo} inválida` });
    }
    const { de, ate } = filtros;
    if (de && ate && dataValida(de) && dataValida(ate) && de > ate) {
      ctx.addIssue({ code: 'custom', path: ['ate'], message: PERIODO_PAINEL_INVALIDO });
    }
  });

export type FiltrosPainel = z.infer<typeof filtrosPainelSchema>;
export type FiltrosPainelInput = z.input<typeof filtrosPainelSchema>;

/** Como o front formata um valor. */
export const FORMATOS_PAINEL = [
  'inteiro',
  'decimal',
  'moeda',
  'percentual',
  'dias',
  'texto',
  'data',
  'hora',
] as const;
export type FormatoPainel = (typeof FORMATOS_PAINEL)[number];
const formatoSchema = z.enum(FORMATOS_PAINEL);

const celulaSchema = z.union([z.string(), z.number(), z.null()]);

export const kpiPainelSchema = z.object({
  tipo: z.literal('kpi'),
  id: z.string(),
  rotulo: z.string(),
  valor: z.number().nullable(),
  formato: formatoSchema,
  /** Texto pequeno abaixo do valor (ex.: "profissionais ativos"). */
  detalhe: z.string().nullable(),
  /**
   * Rota da lista que o indicador resume, já com o período e o filtro dele na query. Ausente =
   * indicador sem lista própria (não é clicável).
   */
  link: z.string().optional(),
});

export const VISUALIZACOES_PAINEL = ['tabela', 'barras', 'pizza', 'linha'] as const;
export type VisualizacaoPainel = (typeof VISUALIZACOES_PAINEL)[number];
const visualizacaoSchema = z.enum(VISUALIZACOES_PAINEL);

export const colunaPainelSchema = z.object({
  chave: z.string(),
  rotulo: z.string(),
  formato: formatoSchema,
});

/**
 * Tabela do dashboard. Nos gráficos, a primeira coluna é a categoria e as colunas numéricas
 * seguintes são as séries.
 */
export const tabelaPainelSchema = z.object({
  tipo: z.literal('tabela'),
  id: z.string(),
  titulo: z.string(),
  colunas: z.array(colunaPainelSchema),
  linhas: z.array(z.record(z.string(), celulaSchema)),
  /** Visualizações oferecidas no cabeçalho do bloco (ícones Tabela/Barras/Pizza/Linha). */
  visualizacoes: z.array(visualizacaoSchema),
  padrao: visualizacaoSchema,
  largura: z.enum(['cheia', 'meia']),
});

/** Aviso com lista (ex.: contratos ativos sem cobrança no mês). Só vem quando há itens. */
export const alertaPainelSchema = z.object({
  tipo: z.literal('alerta'),
  id: z.string(),
  titulo: z.string(),
  descricao: z.string(),
  itens: z.array(z.object({ rotulo: z.string(), valor: z.string() })),
});

/** Linha da tabela "Meta vs Atual". */
export const indicadorMetaSchema = z.object({
  id: z.string(),
  rotulo: z.string(),
  /** Texto da meta (ex.: "≥85%"); null quando não há meta. */
  meta: z.string().nullable(),
  atual: z.number().nullable(),
  formato: formatoSchema,
  /** Valor negativo ruim destacado em vermelho pelo front. */
  destacarNegativo: z.boolean(),
});

export const metaVsAtualPainelSchema = z.object({
  tipo: z.literal('meta-vs-atual'),
  id: z.string(),
  titulo: z.string(),
  indicadores: z.array(indicadorMetaSchema),
});

export const blocoPainelSchema = z.discriminatedUnion('tipo', [
  kpiPainelSchema,
  tabelaPainelSchema,
  alertaPainelSchema,
  metaVsAtualPainelSchema,
]);

export const secaoPainelSchema = z.object({
  id: z.string(),
  /** Título da seção (ex.: "PRODUÇÃO ASSISTENCIAL"); null nas abas sem seções. */
  titulo: z.string().nullable(),
  blocos: z.array(blocoPainelSchema),
});

export const dashboardPainelSchema = z.object({
  aba: abaPainelSchema,
  periodo: z.object({ de: z.string(), ate: z.string() }),
  base: z.enum(BASES_PERIODO),
  secoes: z.array(secaoPainelSchema),
});

export type KpiPainel = z.infer<typeof kpiPainelSchema>;
export type ColunaPainel = z.infer<typeof colunaPainelSchema>;
export type TabelaPainel = z.infer<typeof tabelaPainelSchema>;
export type AlertaPainel = z.infer<typeof alertaPainelSchema>;
export type IndicadorMeta = z.infer<typeof indicadorMetaSchema>;
export type MetaVsAtualPainel = z.infer<typeof metaVsAtualPainelSchema>;
export type BlocoPainel = z.infer<typeof blocoPainelSchema>;
export type SecaoPainel = z.infer<typeof secaoPainelSchema>;
export type DashboardPainel = z.infer<typeof dashboardPainelSchema>;
