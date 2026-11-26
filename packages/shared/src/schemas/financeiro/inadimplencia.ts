import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';
import { textoObrigatorio } from '../common/obrigatorio';

/**
 * Inadimplência: painel e régua de cobrança (issue #166; requisitos R §18 e §44). O painel soma o
 * saldo em aberto de Contas a Receber (a mesma base da tela); a régua cobra só os títulos que têm
 * um profissional como sacado (contratos de sala, #165), decisão do dev.
 */

/** Marcos da régua, em ordem. Os dias são em relação ao vencimento (negativo = antes). */
export const MARCOS_COBRANCA = [
  'ANTES_3_DIAS',
  'NO_VENCIMENTO',
  'DEPOIS_3_DIAS',
  'DEPOIS_7_DIAS',
] as const;
export type MarcoCobranca = (typeof MARCOS_COBRANCA)[number];
export const marcoCobrancaSchema = z.enum(MARCOS_COBRANCA, { error: 'Marco inválido' });

export const DIAS_DO_MARCO: Readonly<Record<MarcoCobranca, number>> = {
  ANTES_3_DIAS: -3,
  NO_VENCIMENTO: 0,
  DEPOIS_3_DIAS: 3,
  DEPOIS_7_DIAS: 7,
};

export const MARCO_ROTULO: Readonly<Record<MarcoCobranca, string>> = {
  ANTES_3_DIAS: '3 dias antes do vencimento',
  NO_VENCIMENTO: 'No vencimento',
  DEPOIS_3_DIAS: '3 dias depois do vencimento',
  DEPOIS_7_DIAS: '7 dias depois do vencimento',
};

/** Variáveis aceitas no texto da mensagem, escritas como `{nome}`. */
export const VARIAVEIS_COBRANCA = ['nome', 'valor', 'vencimento', 'titulo'] as const;
export type VariavelCobranca = (typeof VARIAVEIS_COBRANCA)[number];

/** Textos padrão, a confirmar com o cliente (issue #166, "Precisa de confirmação"). */
export const MENSAGEM_PADRAO_MARCO: Readonly<Record<MarcoCobranca, string>> = {
  ANTES_3_DIAS:
    'Olá, {nome}! Lembramos que o título {titulo}, no valor de {valor}, vence em {vencimento}.',
  NO_VENCIMENTO:
    'Olá, {nome}! O título {titulo}, no valor de {valor}, vence hoje ({vencimento}). Qualquer dúvida, fale conosco.',
  DEPOIS_3_DIAS:
    'Olá, {nome}! Não identificamos o pagamento do título {titulo}, de {valor}, vencido em {vencimento}. Se já pagou, desconsidere.',
  DEPOIS_7_DIAS:
    'Olá, {nome}! O título {titulo}, de {valor}, está vencido desde {vencimento}. Entre em contato para regularizar.',
};

export const MENSAGEM_COBRANCA_MAX = 1000;

/** Troca `{variavel}` pelo valor; variável sem valor ou desconhecida fica como está. */
export function aplicarVariaveisCobranca(
  texto: string,
  valores: Readonly<Record<VariavelCobranca, string>>,
): string {
  return texto.replaceAll(/\{(\w+)\}/g, (original, nome: string) =>
    (VARIAVEIS_COBRANCA as readonly string[]).includes(nome)
      ? valores[nome as VariavelCobranca]
      : original,
  );
}

/** Faixas de atraso do aging, em dias. */
export const FAIXAS_AGING = ['ATE_30', 'DE_31_A_60', 'ACIMA_60'] as const;
export type FaixaAging = (typeof FAIXAS_AGING)[number];
export const faixaAgingSchema = z.enum(FAIXAS_AGING, { error: 'Faixa inválida' });

export const FAIXA_AGING_ROTULO: Readonly<Record<FaixaAging, string>> = {
  ATE_30: '0 a 30 dias',
  DE_31_A_60: '31 a 60 dias',
  ACIMA_60: 'Mais de 60 dias',
};

/** Faixa do atraso (dias inteiros, maior que zero): 1 a 30, 31 a 60 e mais de 60. */
export function faixaDoAtraso(diasEmAtraso: number): FaixaAging {
  if (diasEmAtraso <= 30) return 'ATE_30';
  if (diasEmAtraso <= 60) return 'DE_31_A_60';
  return 'ACIMA_60';
}

// ---------- Régua ----------

export const reguaMarcoSchema = z.object({
  id: z.uuid(),
  marco: marcoCobrancaSchema,
  dias: z.number().int(),
  ativo: z.boolean(),
  enviarWhatsapp: z.boolean(),
  alertaInterno: z.boolean(),
  mensagem: z.string(),
  updatedAt: z.iso.datetime(),
});
export type ReguaMarco = z.infer<typeof reguaMarcoSchema>;
export const reguaCobrancaSchema = z.array(reguaMarcoSchema);

/** `PATCH /api/financeiro/inadimplencia/regua/:marco` (o marco e os dias não mudam). */
export const updateReguaMarcoSchema = z
  .strictObject({
    ativo: z.boolean({ error: 'Valor inválido' }).optional(),
    enviarWhatsapp: z.boolean({ error: 'Valor inválido' }).optional(),
    alertaInterno: z.boolean({ error: 'Valor inválido' }).optional(),
    mensagem: textoObrigatorio('Mensagem', { genero: 'f', max: MENSAGEM_COBRANCA_MAX }).optional(),
  })
  .refine((data) => Object.values(data).some((valor) => valor !== undefined), {
    error: 'Informe ao menos um campo para alterar',
  });
export type UpdateReguaMarcoInput = z.infer<typeof updateReguaMarcoSchema>;

export const marcoParamSchema = z.strictObject({ marco: marcoCobrancaSchema });

// ---------- Painel ----------

const valorQuantidadeSchema = z.object({
  /** Valor em reais, com duas casas (`"1234.50"`). */
  valor: z.string(),
  quantidade: z.number().int().nonnegative(),
});

export const painelInadimplenciaSchema = z.object({
  /** Dia a que o painel se refere (`AAAA-MM-DD`, fuso da clínica). */
  data: z.iso.date(),
  /** Saldo em aberto dos títulos que vencem hoje. */
  aReceberHoje: valorQuantidadeSchema,
  /** Saldo em aberto dos títulos vencidos (vencimento antes de hoje). */
  vencidos: valorQuantidadeSchema,
  aging: z.array(valorQuantidadeSchema.extend({ faixa: faixaAgingSchema })),
  contratosInadimplentes: z.number().int().nonnegative(),
  profissionaisInadimplentes: z.number().int().nonnegative(),
  porProfissional: z.array(
    z.object({
      profissionalId: z.uuid(),
      nome: z.string(),
      valor: z.string(),
      quantidade: z.number().int().nonnegative(),
      maiorAtrasoDias: z.number().int().nonnegative(),
    }),
  ),
});
export type PainelInadimplencia = z.infer<typeof painelInadimplenciaSchema>;

export const TITULO_INADIMPLENTE_SORT_FIELDS = ['vencimento', 'saldo', 'atraso'] as const;

/** `GET /api/financeiro/inadimplencia/titulos`: os títulos que o painel soma. */
export const listTitulosInadimplentesQuerySchema = listQuerySchema({
  sortFields: TITULO_INADIMPLENTE_SORT_FIELDS,
  defaultSort: 'vencimento:asc',
  filters: {
    faixa: faixaAgingSchema.optional(),
    profissionalId: z.uuid({ error: 'Profissional inválido' }).optional(),
  },
});
export type ListTitulosInadimplentesQuery = z.infer<typeof listTitulosInadimplentesQuerySchema>;

export const tituloInadimplenteSchema = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  descricao: z.string(),
  /** Quem deve: o profissional (contrato de sala) ou o paciente; nulo quando o título não tem sacado. */
  sacadoTipo: z.enum(['PROFISSIONAL', 'PACIENTE']).nullable(),
  sacadoNome: z.string().nullable(),
  profissionalId: z.uuid().nullable(),
  contratoSalaId: z.uuid().nullable(),
  contratoSalaNumero: z.number().int().nullable(),
  dataVencimento: z.iso.date(),
  saldo: z.string(),
  diasEmAtraso: z.number().int().nonnegative(),
  faixa: faixaAgingSchema,
  /** Marcos da régua já cobrados neste título. */
  cobrancas: z.number().int().nonnegative(),
});
export type TituloInadimplente = z.infer<typeof tituloInadimplenteSchema>;
export const tituloInadimplentePageSchema = paginatedResponseSchema(tituloInadimplenteSchema);

// ---------- Histórico de cobranças ----------

export const STATUS_COBRANCA_ENVIO = ['ENVIADO', 'FALHA'] as const;
export type StatusCobrancaEnvio = (typeof STATUS_COBRANCA_ENVIO)[number];

/** Motivos de falha gravados no histórico. */
export const ERROS_COBRANCA_ENVIO = ['SEM_TELEFONE', 'SEM_CANAL'] as const;
export type ErroCobrancaEnvio = (typeof ERROS_COBRANCA_ENVIO)[number];

export const COBRANCA_ENVIO_SORT_FIELDS = ['createdAt', 'marco'] as const;

/** `GET /api/financeiro/inadimplencia/cobrancas`. */
export const listCobrancasEnviadasQuerySchema = listQuerySchema({
  sortFields: COBRANCA_ENVIO_SORT_FIELDS,
  defaultSort: 'createdAt:desc',
  filters: {
    contaReceberId: z.uuid({ error: 'Título inválido' }).optional(),
    marco: marcoCobrancaSchema.optional(),
    status: z.enum(STATUS_COBRANCA_ENVIO, { error: 'Situação inválida' }).optional(),
  },
});
export type ListCobrancasEnviadasQuery = z.infer<typeof listCobrancasEnviadasQuerySchema>;

export const cobrancaEnviadaSchema = z.object({
  id: z.uuid(),
  contaReceberId: z.uuid(),
  contaReceberNumero: z.number().int(),
  profissionalNome: z.string().nullable(),
  marco: marcoCobrancaSchema,
  canal: z.enum(['WHATSAPP'], { error: 'Canal inválido' }),
  status: z.enum(STATUS_COBRANCA_ENVIO),
  /** Código da falha (`ERROS_COBRANCA_ENVIO`); nulo quando enviado. */
  erro: z.string().nullable(),
  /** Dia do vencimento do título na hora do envio (`AAAA-MM-DD`). */
  vencimento: z.iso.date(),
  createdAt: z.iso.datetime(),
});
export type CobrancaEnviada = z.infer<typeof cobrancaEnviadaSchema>;
export const cobrancaEnviadaPageSchema = paginatedResponseSchema(cobrancaEnviadaSchema);
