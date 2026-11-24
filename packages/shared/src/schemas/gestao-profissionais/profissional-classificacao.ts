import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';
import { paginatedResponseSchema, paginationQuerySchema } from '../common/pagination';

/**
 * Classificação automática do parceiro (issue #143, R §25, §27, §44 e §45): lê o uso dos
 * períodos contratados e o contrato do profissional e diz em que ponto da relação ele está.
 *
 * Regras confirmadas pelo dev na #143 (a seção 25 do documento só exemplifica "Em risco"):
 * - **Inativo:** profissional inativo ou sem contrato de sala ativo e vigente;
 * - **Estratégico:** marcado manualmente pela gerência; vale sobre as demais, menos "Inativo";
 * - **Novo:** até 90 dias desde a assinatura do contrato (sem assinatura, desde o início);
 * - **Em risco:** usou menos de 50% dos períodos contratados nos últimos 30 dias;
 * - **Em expansão:** aumentou os períodos contratados (por semana, comparada à de 30 dias antes) ou
 *   atendeu em mais períodos do que contratou nos últimos 30 dias;
 * - **Ativo:** o caso comum, sem nenhuma das anteriores.
 * Precedência: Inativo, Estratégico, Novo, Em risco, Em expansão e Ativo.
 */

export const CLASSIFICACOES_PARCEIRO = [
  'NOVO',
  'ATIVO',
  'ESTRATEGICO',
  'EM_EXPANSAO',
  'EM_RISCO',
  'INATIVO',
] as const;
export type ClassificacaoParceiro = (typeof CLASSIFICACOES_PARCEIRO)[number];
export const classificacaoParceiroSchema = z.enum(CLASSIFICACOES_PARCEIRO, {
  error: () => traduzirValidacao('validacao.opcaoInvalida'),
});

/** Rótulos em português (API e exportação). A tela usa as traduções. */
export const CLASSIFICACAO_PARCEIRO_ROTULOS: Readonly<Record<ClassificacaoParceiro, string>> = {
  NOVO: 'Novo parceiro',
  ATIVO: 'Parceiro ativo',
  ESTRATEGICO: 'Parceiro estratégico',
  EM_EXPANSAO: 'Em expansão',
  EM_RISCO: 'Em risco',
  INATIVO: 'Inativo',
};

/** Janela, em dias, do uso dos períodos contratados. */
export const CLASSIFICACAO_JANELA_DIAS = 30;
/** Dias, desde o início do contrato, em que o parceiro ainda é "Novo". */
export const CLASSIFICACAO_NOVO_DIAS = 90;
/** Uso (%) dos períodos contratados abaixo do qual o parceiro está "Em risco". */
export const CLASSIFICACAO_RISCO_TAXA_MAXIMA = 50;

/** Por que o profissional recebeu a classificação (o texto é montado a partir daqui). */
export const CLASSIFICACAO_MOTIVOS = [
  'PROFISSIONAL_INATIVO',
  'SEM_CONTRATO_ATIVO',
  'MARCADO_ESTRATEGICO',
  'CONTRATO_RECENTE',
  'BAIXO_USO',
  'MAIS_PERIODOS',
  'USO_ACIMA_DO_CONTRATADO',
  'USO_REGULAR',
] as const;
export type ClassificacaoMotivo = (typeof CLASSIFICACAO_MOTIVOS)[number];
export const classificacaoMotivoSchema = z.enum(CLASSIFICACAO_MOTIVOS);

/** Números do motivo; só os que importam para cada código vêm preenchidos. */
export const classificacaoParametrosSchema = z.object({
  contratados: z.number().int().optional(),
  utilizados: z.number().int().optional(),
  dias: z.number().int().optional(),
  semanaAnterior: z.number().int().optional(),
  semanaAtual: z.number().int().optional(),
});
export type ClassificacaoParametros = z.infer<typeof classificacaoParametrosSchema>;

/** Texto do motivo em português, como no exemplo da issue ("1 de 4 períodos usados em 30 dias"). */
export function textoMotivoClassificacao(
  motivo: ClassificacaoMotivo,
  p: ClassificacaoParametros = {},
): string {
  switch (motivo) {
    case 'PROFISSIONAL_INATIVO':
      return 'Profissional inativo';
    case 'SEM_CONTRATO_ATIVO':
      return 'Sem contrato de sala ativo';
    case 'MARCADO_ESTRATEGICO':
      return 'Marcado como estratégico pela gerência';
    case 'CONTRATO_RECENTE':
      return `Contrato iniciado há ${p.dias ?? 0} dias (até ${CLASSIFICACAO_NOVO_DIAS})`;
    case 'BAIXO_USO':
      return `${p.utilizados ?? 0} de ${p.contratados ?? 0} períodos usados em ${CLASSIFICACAO_JANELA_DIAS} dias`;
    case 'MAIS_PERIODOS':
      return `Períodos contratados por semana subiram de ${p.semanaAnterior ?? 0} para ${p.semanaAtual ?? 0}`;
    case 'USO_ACIMA_DO_CONTRATADO':
      return `${p.utilizados ?? 0} períodos usados para ${p.contratados ?? 0} contratados em ${CLASSIFICACAO_JANELA_DIAS} dias`;
    case 'USO_REGULAR':
      return `${p.utilizados ?? 0} de ${p.contratados ?? 0} períodos usados em ${CLASSIFICACAO_JANELA_DIAS} dias`;
  }
}

/** Filtro da listagem de profissionais. */
export const profissionalClassificacaoFiltroSchema = classificacaoParceiroSchema;

/** Registro do histórico: uma linha por mudança de classificação (só inserção). */
export const classificacaoHistoricoSchema = z.object({
  id: z.uuid(),
  profissionalId: z.uuid(),
  /** `null` na primeira classificação. */
  classificacaoAnterior: classificacaoParceiroSchema.nullable(),
  classificacao: classificacaoParceiroSchema,
  motivo: classificacaoMotivoSchema,
  parametros: classificacaoParametrosSchema,
  /** Motivo em português, pronto para exibir e exportar. */
  motivoTexto: z.string(),
  /** `AUTOMATICO` (cálculo diário ou recálculo) ou `MANUAL` (marcou ou desmarcou "Estratégico"). */
  origem: z.enum(['AUTOMATICO', 'MANUAL']),
  /** Usuário que provocou a mudança; `null` no cálculo diário. */
  usuarioId: z.string().nullable(),
  /** Dia (fuso da clínica) a que o cálculo se refere. */
  referencia: z.iso.date(),
  createdAt: z.iso.datetime(),
});
export type ClassificacaoHistorico = z.infer<typeof classificacaoHistoricoSchema>;

/** `GET /api/gestao-profissionais/profissionais/:id/classificacoes`. */
export const classificacaoHistoricoPageSchema = paginatedResponseSchema(
  classificacaoHistoricoSchema,
);
export type ClassificacaoHistoricoPage = z.infer<typeof classificacaoHistoricoPageSchema>;

export const listClassificacoesQuerySchema = paginationQuerySchema;
export type ListClassificacoesQuery = z.infer<typeof listClassificacoesQuerySchema>;

/** `PUT /api/gestao-profissionais/profissionais/:id/estrategico`. */
export const estrategicoInputSchema = z.strictObject({ estrategico: z.boolean() });
export type EstrategicoInput = z.infer<typeof estrategicoInputSchema>;

/** `POST /api/gestao-profissionais/profissionais/classificacao/recalcular`. */
export const recalculoClassificacaoSchema = z.object({
  avaliados: z.number().int(),
  alterados: z.number().int(),
});
export type RecalculoClassificacao = z.infer<typeof recalculoClassificacaoSchema>;

/** Contagens e lista do Painel (indicadores e alerta de baixa utilização). */
export const resumoParceirosSchema = z.object({
  total: z.number().int(),
  porClassificacao: z.record(classificacaoParceiroSchema, z.number().int()),
  emRisco: z.array(
    z.object({
      profissionalId: z.uuid(),
      nome: z.string(),
      motivoTexto: z.string(),
    }),
  ),
});
export type ResumoParceiros = z.infer<typeof resumoParceirosSchema>;
