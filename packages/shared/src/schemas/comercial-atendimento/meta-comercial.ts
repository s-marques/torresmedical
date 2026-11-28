import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';
import { listQuerySchema } from '../common/list-query';
import { erroObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';
import { dataSchemaOpcional } from './periodo-vendas';

/**
 * Metas comerciais (issue #172; requisitos R §24): meta projetada por período (mês ou trimestre),
 * métrica e responsável, comparada com o realizado calculado a partir do CRM.
 */
export const META_METRICAS = [
  'LEADS',
  'VISITAS',
  'PROPOSTAS',
  'CONTRATOS_FECHADOS',
  'RECEITA_NOVA',
] as const;
export type MetaMetrica = (typeof META_METRICAS)[number];

export const META_PERIODO_TIPOS = ['MES', 'TRIMESTRE'] as const;
export type MetaPeriodoTipo = (typeof META_PERIODO_TIPOS)[number];

/** Métrica em reais; as demais são contagens. */
export const META_METRICA_MONETARIA: MetaMetrica = 'RECEITA_NOVA';

export const META_OBSERVACOES_MAX = 500;
export const META_VALOR_MAX = 999_999_999;

const PERIODO_MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const PERIODO_TRIMESTRE = /^(\d{4})-T([1-4])$/;

const opcaoInvalida = () => traduzirValidacao('validacao.opcaoInvalida');

/**
 * Período no formato `AAAA-MM` (mês) ou `AAAA-T1`…`AAAA-T4` (trimestre). Devolve as datas do
 * calendário (`AAAA-MM-DD`) do primeiro e do último dia, ou `null` se o texto não bate com o tipo.
 */
export function intervaloDaMeta(
  tipo: MetaPeriodoTipo,
  periodo: string,
): { inicio: string; fim: string } | null {
  if (tipo === 'MES') {
    const partes = PERIODO_MES.exec(periodo);
    if (!partes) return null;
    const ano = Number(partes[1]);
    const mes = Number(partes[2]);
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const mm = String(mes).padStart(2, '0');
    return { inicio: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(ultimo).padStart(2, '0')}` };
  }
  const partes = PERIODO_TRIMESTRE.exec(periodo);
  if (!partes) return null;
  const ano = Number(partes[1]);
  const primeiroMes = (Number(partes[2]) - 1) * 3 + 1;
  const ultimoMes = primeiroMes + 2;
  const ultimo = new Date(Date.UTC(ano, ultimoMes, 0)).getUTCDate();
  const mm = (mes: number) => String(mes).padStart(2, '0');
  return {
    inicio: `${ano}-${mm(primeiroMes)}-01`,
    fim: `${ano}-${mm(ultimoMes)}-${String(ultimo).padStart(2, '0')}`,
  };
}

/** `POST /api/comercial-atendimento/metas` e `PATCH /:id` (todos os campos, como no formulário). */
export const metaComercialInputSchema = z
  .strictObject({
    metrica: z.enum(META_METRICAS, { error: opcaoInvalida }),
    periodoTipo: z.enum(META_PERIODO_TIPOS, { error: opcaoInvalida }),
    periodo: z
      .string({ error: erroObrigatorio('Período') })
      .trim()
      .min(1, {
        error: erroObrigatorio('Período'),
      }),
    /** Sem responsável, a meta vale para a equipe comercial toda. */
    responsavelId: z
      .union([
        z.uuid({ error: () => traduzirValidacao('validacao.formato.uuid') }),
        z.literal(''),
        z.null(),
      ])
      .optional()
      .transform((valor) => valor || null),
    valor: z
      .number({ error: erroObrigatorio('Valor') })
      .min(0, { error: () => traduzirValidacao('validacao.maiorOuIgual', { valor: 0 }) })
      .max(META_VALOR_MAX, {
        error: () => traduzirValidacao('validacao.menorOuIgual', { valor: META_VALOR_MAX }),
      }),
    observacoes: z
      .string()
      .trim()
      .max(META_OBSERVACOES_MAX, {
        error: () => traduzirValidacao('validacao.textoMax', { count: META_OBSERVACOES_MAX }),
      })
      .optional()
      .transform((valor) => valor || null),
  })
  .superRefine((meta, ctx) => {
    if (meta.periodo && !intervaloDaMeta(meta.periodoTipo, meta.periodo)) {
      ctx.addIssue({
        code: 'custom',
        path: ['periodo'],
        message: traduzirValidacao('validacao.metaComercial.periodoInvalido'),
      });
    }
  });

export type MetaComercialInput = z.output<typeof metaComercialInputSchema>;
export type MetaComercialFormulario = z.input<typeof metaComercialInputSchema>;

export const META_SORT_FIELDS = ['dataInicio', 'metrica', 'valor'] as const;

const dataFiltro = (qual: 'inicial' | 'final') => dataSchemaOpcional(qual);

const filtrosMeta = {
  metrica: z.enum(META_METRICAS, { error: opcaoInvalida }).optional(),
  responsavelId: z.uuid({ error: () => traduzirValidacao('validacao.formato.uuid') }).optional(),
  /** Metas cujo período toca o intervalo De/Até (`AAAA-MM-DD`). */
  de: dataFiltro('inicial'),
  ate: dataFiltro('final'),
};

/** `GET /api/comercial-atendimento/metas`. */
export const listMetasComerciaisQuerySchema = listQuerySchema({
  sortFields: META_SORT_FIELDS,
  defaultSort: 'dataInicio:desc',
  filters: filtrosMeta,
});
export type ListMetasComerciaisQuery = z.infer<typeof listMetasComerciaisQuerySchema>;

/** `GET /api/comercial-atendimento/metas/acompanhamento`: os mesmos filtros, sem paginação. */
export const acompanhamentoMetasQuerySchema = z.object(filtrosMeta);
export type AcompanhamentoMetasQuery = z.infer<typeof acompanhamentoMetasQuerySchema>;

export const metaComercialSchema = z.object({
  id: z.uuid(),
  metrica: z.enum(META_METRICAS),
  periodoTipo: z.enum(META_PERIODO_TIPOS),
  periodo: z.string(),
  dataInicio: z.iso.date(),
  dataFim: z.iso.date(),
  responsavelId: z.uuid().nullable(),
  responsavel: z.string().nullable(),
  observacoes: z.string().nullable(),
  /** Meta projetada. */
  valor: z.number(),
  /** Calculado do CRM no período (e do responsável, quando a meta tem um). */
  realizado: z.number(),
  /** Realizado ÷ projetado, em % com 1 casa; `null` com meta zerada. */
  percentual: z.number().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MetaComercial = z.infer<typeof metaComercialSchema>;

export const metaComercialPageSchema = paginatedResponseSchema(metaComercialSchema);

export const metaResumoSchema = z.object({
  metrica: z.enum(META_METRICAS),
  projetado: z.number(),
  realizado: z.number(),
  percentual: z.number().nullable(),
});
export type MetaResumo = z.infer<typeof metaResumoSchema>;

export const metaEvolucaoSchema = z.object({
  metrica: z.enum(META_METRICAS),
  periodoTipo: z.enum(META_PERIODO_TIPOS),
  periodo: z.string(),
  dataInicio: z.iso.date(),
  projetado: z.number(),
  realizado: z.number(),
  percentual: z.number().nullable(),
});
export type MetaEvolucao = z.infer<typeof metaEvolucaoSchema>;

export const acompanhamentoMetasSchema = z.object({
  /** Total do filtro por métrica (somando todos os períodos e responsáveis). */
  resumo: z.array(metaResumoSchema),
  /** Período a período, do mais antigo ao mais recente: evolução e histórico. */
  evolucao: z.array(metaEvolucaoSchema),
});
export type AcompanhamentoMetas = z.infer<typeof acompanhamentoMetasSchema>;

/** Realizado ÷ projetado em %, com 1 casa. `null` quando não há meta a comparar. */
export function percentualAtingido(realizado: number, projetado: number): number | null {
  if (projetado <= 0) return null;
  return Math.round((realizado / projetado) * 1000) / 10;
}
