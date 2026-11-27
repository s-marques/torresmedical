import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';

/**
 * Relatório mensal de apresentação da gestão (issue #171, R §27): os 10 indicadores do prédio para
 * a reunião mensal. A API devolve só números e códigos; os textos de tela saem no idioma do
 * usuário (`apresentacao.*` nos locales) e o PDF, em português.
 */
export const INDICADORES_APRESENTACAO = [
  'faturamento',
  'faturamento-futuro',
  'faturamento-produto',
  'ocupacao',
  'despesas-centro-custo',
  'estoque',
  'leads',
  'visitas',
  'nps-medicos',
  'nps-pacientes',
] as const;
export const indicadorApresentacaoSchema = z.enum(INDICADORES_APRESENTACAO);
export type IndicadorApresentacaoId = z.infer<typeof indicadorApresentacaoSchema>;

export const FORMATOS_INDICADOR_APRESENTACAO = ['moeda', 'numero', 'percentual', 'nps'] as const;
export const formatoIndicadorApresentacaoSchema = z.enum(FORMATOS_INDICADOR_APRESENTACAO);
export type FormatoIndicadorApresentacao = z.infer<typeof formatoIndicadorApresentacaoSchema>;

/**
 * - `tendencia`: a série são os últimos meses, em ordem (o último é o mês escolhido);
 * - `comparativo`: cada item tem o valor do mês e o `anterior` (mês anterior ou média).
 */
export const GRAFICOS_INDICADOR = ['tendencia', 'comparativo'] as const;

/** O que o `anterior` representa. */
export const COMPARACOES_INDICADOR = ['MES_ANTERIOR', 'MEDIA_90_DIAS', 'NENHUMA'] as const;

/** Observações fixas de um indicador, traduzidas no front e escritas em português no PDF. */
export const AVISOS_APRESENTACAO = [
  /** Sem o catálogo de produtos (#169), o faturamento por produto sai por modalidade do contrato. */
  'PRODUTO_POR_MODALIDADE',
  'ESTOQUE_POR_CATEGORIA',
  'LEADS_POR_ORIGEM',
  /** Não há registro de visitas recebidas na clínica. */
  'VISITAS_RECEBIDAS_INDISPONIVEL',
  /** A pesquisa não distingue quem atendeu o paciente (recepção/secretária). */
  'NPS_PACIENTES_TODOS',
  'OCUPACAO_PREVISAO_CONTRATOS',
] as const;
export const avisoApresentacaoSchema = z.enum(AVISOS_APRESENTACAO);
export type AvisoApresentacao = z.infer<typeof avisoApresentacaoSchema>;

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export const apresentacaoMensalQuerySchema = z.object({
  /** Mês do relatório, `AAAA-MM`. */
  mes: z
    .string()
    .trim()
    .regex(MES, { error: () => traduzirValidacao('validacao.formatoInvalido') }),
});
export type ApresentacaoMensalQuery = z.infer<typeof apresentacaoMensalQuerySchema>;

/** Um ponto do gráfico. `valor` nulo é "dado indisponível" (nunca um número estimado). */
export const pontoIndicadorSchema = z.object({
  rotulo: z.string(),
  /** Quando o rótulo é fixo do sistema (ex.: `vacancia`), o front traduz por esta chave. */
  chave: z.string().nullable(),
  valor: z.number().nullable(),
  anterior: z.number().nullable(),
});
export type PontoIndicador = z.infer<typeof pontoIndicadorSchema>;

export const indicadorApresentacaoDadosSchema = z.object({
  id: indicadorApresentacaoSchema,
  /** Posição na apresentação (1 a 10, como na issue). */
  numero: z.number().int().min(1).max(10),
  formato: formatoIndicadorApresentacaoSchema,
  grafico: z.enum(GRAFICOS_INDICADOR),
  comparacao: z.enum(COMPARACOES_INDICADOR),
  valor: z.number().nullable(),
  anterior: z.number().nullable(),
  /**
   * Variação de `valor` sobre `anterior`; nula sem base de cálculo. Em moeda e número é o
   * percentual; em percentual e NPS é a diferença em pontos.
   */
  variacao: z.number().nullable(),
  serie: z.array(pontoIndicadorSchema),
  /** Lista de apoio (ex.: os médicos que receberam visita), do maior para o menor. */
  detalhe: z.array(pontoIndicadorSchema),
  avisos: z.array(avisoApresentacaoSchema),
});
export type IndicadorApresentacao = z.infer<typeof indicadorApresentacaoDadosSchema>;

export const apresentacaoMensalSchema = z.object({
  mes: z.string(),
  mesAnterior: z.string(),
  geradoEm: z.iso.datetime(),
  /** Só os indicadores que o usuário pode ver (permissão da tela dona dos dados). */
  indicadores: z.array(indicadorApresentacaoDadosSchema),
});
export type ApresentacaoMensal = z.infer<typeof apresentacaoMensalSchema>;
