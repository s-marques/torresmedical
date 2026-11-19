import { z } from 'zod';
import { ativoStatusSchema, listQuerySchema } from '../common/list-query';
import { mensagemObrigatoria, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';
import { normalizarTelefoneWhatsapp } from '../comercial-atendimento/conversa-whatsapp';

/**
 * Tela Instruções Agente (`/agentes-ia/instrucoes`): instruções (system prompt), instruções
 * extras, destinos de alerta e regras do agente de IA.
 */

/** Regra fixa do agente (IA p. 4): não é editável por script. */
export const AGENTE_REGRA_FIXA =
  'O agente não faz diagnóstico, prescrição nem decisões clínicas. Situações de risco seguem o protocolo de encaminhamento para a equipe.';

// ---------------------------------------------------------------------------------------------
// Instruções (aba "Instruções")
// ---------------------------------------------------------------------------------------------

export const AGENTE_MODELO_RECOMENDADO = 'gpt-4.1-mini';
export const AGENTE_MODELO_RECOMENDADO_ROTULO = 'GPT-4.1 Mini (Recomendado)';
export const AGENTE_TEMPERATURA_PADRAO = 0.7;
export const AGENTE_TEMPERATURA_MAX = 2;
export const AGENTE_MAX_TOKENS_PADRAO = 1500;
export const AGENTE_MAX_TOKENS_MAX = 32000;
export const AGENTE_NOME_MAX = 150;
export const AGENTE_PROMPT_MAX = 50000;

/** Ciclo de aprovação do script (IA p. 2): rascunho → em teste → aprovado → publicado. */
export const AGENTE_INSTRUCAO_STATUS = ['RASCUNHO', 'EM_TESTE', 'APROVADO', 'PUBLICADO'] as const;
export const agenteInstrucaoStatusSchema = z.enum(AGENTE_INSTRUCAO_STATUS, {
  error: 'Status inválido',
});
export type AgenteInstrucaoStatus = z.infer<typeof agenteInstrucaoStatusSchema>;

export const AGENTE_INSTRUCAO_STATUS_ROTULO: Record<AgenteInstrucaoStatus, string> = {
  RASCUNHO: 'Rascunho',
  EM_TESTE: 'Em teste',
  APROVADO: 'Aprovado',
  PUBLICADO: 'Publicado',
};

/** Transições permitidas. Voltar a rascunho é sempre possível; só se avança um passo por vez. */
export const AGENTE_INSTRUCAO_TRANSICOES: Record<
  AgenteInstrucaoStatus,
  readonly AgenteInstrucaoStatus[]
> = {
  RASCUNHO: ['EM_TESTE'],
  EM_TESTE: ['APROVADO', 'RASCUNHO'],
  APROVADO: ['PUBLICADO', 'RASCUNHO'],
  PUBLICADO: ['RASCUNHO'],
};

export const AGENTE_ATIVO_SEM_PUBLICAR =
  'Só é possível ativar uma instrução publicada (aprovada). Publique-a antes.';
export const AGENTE_TRANSICAO_INVALIDA = 'Transição de status não permitida';

const temperatura = z
  .number({ error: 'Temperatura inválida' })
  .min(0, { error: 'Temperatura deve ser maior ou igual a 0' })
  .max(AGENTE_TEMPERATURA_MAX, {
    error: `Temperatura deve ser menor ou igual a ${AGENTE_TEMPERATURA_MAX}`,
  });

const maxTokens = z
  .number({ error: 'Max Tokens inválido' })
  .int({ error: 'Max Tokens inválido' })
  .min(1, { error: 'Max Tokens deve ser maior ou igual a 1' })
  .max(AGENTE_MAX_TOKENS_MAX, {
    error: `Max Tokens deve ser menor ou igual a ${AGENTE_MAX_TOKENS_MAX}`,
  });

/**
 * Corpo de `POST` e `PATCH /api/configuracoes-gestao/agente-instrucoes` (modais "Nova Instrução" e
 * "Editar Instrução"): Nome e System Prompt são obrigatórios (asterisco no inventário). O `PATCH`
 * substitui os campos e volta o status para rascunho quando o conteúdo muda.
 */
export const agenteInstrucaoInputSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: AGENTE_NOME_MAX }),
  modelo: z
    .string({ error: mensagemObrigatoria('Modelo') })
    .trim()
    .min(1, { error: mensagemObrigatoria('Modelo') })
    .max(100, { error: 'Modelo deve ter no máximo 100 caracteres' }),
  temperatura,
  maxTokens,
  ativo: z.boolean({ error: 'Ativo inválido' }),
  systemPrompt: textoObrigatorio('System Prompt', { max: AGENTE_PROMPT_MAX }),
});
export type AgenteInstrucaoFormulario = z.input<typeof agenteInstrucaoInputSchema>;
export type CreateAgenteInstrucaoInput = z.output<typeof agenteInstrucaoInputSchema>;
export type UpdateAgenteInstrucaoInput = CreateAgenteInstrucaoInput;
export const createAgenteInstrucaoSchema = agenteInstrucaoInputSchema;
export const updateAgenteInstrucaoSchema = agenteInstrucaoInputSchema;

/** `PATCH /:id/status`: avança ou volta o ciclo de aprovação. */
export const alterarStatusAgenteInstrucaoSchema = z.strictObject({
  status: agenteInstrucaoStatusSchema,
});
export type AlterarStatusAgenteInstrucaoInput = z.output<typeof alterarStatusAgenteInstrucaoSchema>;

export const AGENTE_INSTRUCAO_SORT_FIELDS = ['nome', 'createdAt', 'updatedAt'] as const;
export const listAgenteInstrucaoQuerySchema = listQuerySchema({
  sortFields: AGENTE_INSTRUCAO_SORT_FIELDS,
  defaultSort: 'createdAt:asc',
  filters: { status: ativoStatusSchema.optional() },
});
export type ListAgenteInstrucaoQuery = z.infer<typeof listAgenteInstrucaoQuerySchema>;

export const agenteInstrucaoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  modelo: z.string(),
  temperatura: z.number(),
  maxTokens: z.number().int(),
  ativo: z.boolean(),
  systemPrompt: z.string(),
  status: agenteInstrucaoStatusSchema,
  versaoAtual: z.number().int(),
  aprovadoPor: z.uuid().nullable(),
  aprovadoPorNome: z.string().nullable(),
  aprovadoEm: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AgenteInstrucao = z.infer<typeof agenteInstrucaoSchema>;
export const agenteInstrucaoPageSchema = paginatedResponseSchema(agenteInstrucaoSchema);
export type AgenteInstrucaoPage = z.infer<typeof agenteInstrucaoPageSchema>;

/** Histórico de versões (IA p. 4): cada alteração de conteúdo gera uma versão. */
export const agenteInstrucaoVersaoSchema = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  nome: z.string(),
  modelo: z.string(),
  temperatura: z.number(),
  maxTokens: z.number().int(),
  systemPrompt: z.string(),
  criadoPor: z.uuid().nullable(),
  criadoPorNome: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AgenteInstrucaoVersao = z.infer<typeof agenteInstrucaoVersaoSchema>;
export const agenteInstrucaoVersoesSchema = z.array(agenteInstrucaoVersaoSchema);

// ---------------------------------------------------------------------------------------------
// Instruções extras (aba "Instruções Extras")
// ---------------------------------------------------------------------------------------------

export const AGENTE_EXTRA_TITULO_MAX = 150;
export const AGENTE_TEXTO_MAX = 5000;

/** Modal "Nova Instrução Extra". Campos inferidos dos cards do inventário (a confirmar). */
export const agenteInstrucaoExtraInputSchema = z.strictObject({
  titulo: textoObrigatorio('Título', { max: AGENTE_EXTRA_TITULO_MAX }),
  descricao: textoObrigatorio('Descrição', { genero: 'f', max: AGENTE_TEXTO_MAX }),
  ativo: z.boolean({ error: 'Ativo inválido' }),
});
export type AgenteInstrucaoExtraFormulario = z.input<typeof agenteInstrucaoExtraInputSchema>;
export type CreateAgenteInstrucaoExtraInput = z.output<typeof agenteInstrucaoExtraInputSchema>;
export type UpdateAgenteInstrucaoExtraInput = CreateAgenteInstrucaoExtraInput;
export const createAgenteInstrucaoExtraSchema = agenteInstrucaoExtraInputSchema;
export const updateAgenteInstrucaoExtraSchema = agenteInstrucaoExtraInputSchema;

export const alterarAtivoAgenteSchema = z.strictObject({
  ativo: z.boolean({ error: 'Status inválido' }),
});
export type AlterarAtivoAgenteInput = z.output<typeof alterarAtivoAgenteSchema>;

export const AGENTE_EXTRA_SORT_FIELDS = ['titulo', 'createdAt'] as const;
export const listAgenteInstrucaoExtraQuerySchema = listQuerySchema({
  sortFields: AGENTE_EXTRA_SORT_FIELDS,
  defaultSort: 'createdAt:asc',
  filters: { status: ativoStatusSchema.optional() },
});
export type ListAgenteInstrucaoExtraQuery = z.infer<typeof listAgenteInstrucaoExtraQuerySchema>;

export const agenteInstrucaoExtraSchema = z.object({
  id: z.uuid(),
  titulo: z.string(),
  descricao: z.string(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AgenteInstrucaoExtra = z.infer<typeof agenteInstrucaoExtraSchema>;
export const agenteInstrucaoExtraPageSchema = paginatedResponseSchema(agenteInstrucaoExtraSchema);
export type AgenteInstrucaoExtraPage = z.infer<typeof agenteInstrucaoExtraPageSchema>;

// ---------------------------------------------------------------------------------------------
// Alertas do agente (aba "Alertas do Agente")
// ---------------------------------------------------------------------------------------------

export const AGENTE_ALERTA_TIPOS = ['NUMERO', 'GRUPO'] as const;
export const agenteAlertaTipoSchema = z.enum(AGENTE_ALERTA_TIPOS, { error: 'Tipo inválido' });
export type AgenteAlertaTipo = z.infer<typeof agenteAlertaTipoSchema>;
export const AGENTE_ALERTA_TIPO_ROTULO: Record<AgenteAlertaTipo, string> = {
  NUMERO: 'Número',
  GRUPO: 'Grupo',
};

export const AGENTE_ALERTA_NOME_MAX = 100;
export const AGENTE_ALERTA_NUMERO_MIN = 10;
/** Id de grupo do WhatsApp tem mais dígitos que um telefone. */
export const AGENTE_ALERTA_NUMERO_MAX = 40;
export const AGENTE_ALERTA_NUMERO_INVALIDO =
  'Informe um número WhatsApp válido, com DDI e DDD. Ex.: 5565999999999';
export const AGENTE_ALERTA_DUPLICADO = 'Este destino já está cadastrado';

/** Formulário inline "Adicionar" (Tipo, Nome, Número WhatsApp). */
export const agenteAlertaDestinoInputSchema = z.strictObject({
  tipo: agenteAlertaTipoSchema,
  nome: textoObrigatorio('Nome', { max: AGENTE_ALERTA_NOME_MAX }),
  numero: z
    .string({ error: mensagemObrigatoria('Número WhatsApp') })
    .trim()
    .min(1, { error: mensagemObrigatoria('Número WhatsApp') })
    .transform((valor) => normalizarTelefoneWhatsapp(valor))
    .refine(
      (digitos) =>
        digitos.length >= AGENTE_ALERTA_NUMERO_MIN && digitos.length <= AGENTE_ALERTA_NUMERO_MAX,
      { error: AGENTE_ALERTA_NUMERO_INVALIDO },
    ),
});
export type AgenteAlertaDestinoFormulario = z.input<typeof agenteAlertaDestinoInputSchema>;
export type CreateAgenteAlertaDestinoInput = z.output<typeof agenteAlertaDestinoInputSchema>;
export const createAgenteAlertaDestinoSchema = agenteAlertaDestinoInputSchema;

export const AGENTE_ALERTA_SORT_FIELDS = ['nome', 'createdAt'] as const;
export const listAgenteAlertaDestinoQuerySchema = listQuerySchema({
  sortFields: AGENTE_ALERTA_SORT_FIELDS,
  defaultSort: 'createdAt:asc',
  filters: {},
});
export type ListAgenteAlertaDestinoQuery = z.infer<typeof listAgenteAlertaDestinoQuerySchema>;

export const agenteAlertaDestinoSchema = z.object({
  id: z.uuid(),
  tipo: agenteAlertaTipoSchema,
  nome: z.string(),
  numero: z.string(),
  createdAt: z.iso.datetime(),
});
export type AgenteAlertaDestino = z.infer<typeof agenteAlertaDestinoSchema>;
export const agenteAlertaDestinoPageSchema = paginatedResponseSchema(agenteAlertaDestinoSchema);
export type AgenteAlertaDestinoPage = z.infer<typeof agenteAlertaDestinoPageSchema>;

// ---------------------------------------------------------------------------------------------
// Regras (aba "Regras")
// ---------------------------------------------------------------------------------------------

export const AGENTE_REGRA_TIPOS = ['POS_RESPOSTA', 'PRE_TOOL'] as const;
export const agenteRegraTipoSchema = z.enum(AGENTE_REGRA_TIPOS, { error: 'Tipo inválido' });
export type AgenteRegraTipo = z.infer<typeof agenteRegraTipoSchema>;
export const AGENTE_REGRA_TIPO_ROTULO: Record<AgenteRegraTipo, string> = {
  POS_RESPOSTA: 'Pós-resposta',
  PRE_TOOL: 'Pré-tool',
};

/** Valores vistos no grid do inventário; a lista completa depende de confirmação do dev. */
export const AGENTE_REGRA_GATILHOS = ['qualquer', 'agendamento', 'venda'] as const;
export const agenteRegraGatilhoSchema = z.enum(AGENTE_REGRA_GATILHOS, {
  error: 'Gatilho inválido',
});
export type AgenteRegraGatilho = z.infer<typeof agenteRegraGatilhoSchema>;

export const AGENTE_REGRA_ACOES = ['BLOQUEAR', 'SUBSTITUIR', 'ALERTAR'] as const;
export const agenteRegraAcaoSchema = z.enum(AGENTE_REGRA_ACOES, { error: 'Ação inválida' });
export type AgenteRegraAcao = z.infer<typeof agenteRegraAcaoSchema>;
export const AGENTE_REGRA_ACAO_ROTULO: Record<AgenteRegraAcao, string> = {
  BLOQUEAR: 'bloquear',
  SUBSTITUIR: 'substituir',
  ALERTAR: 'alertar',
};

export const AGENTE_REGRA_NOME_MAX = 100;
export const AGENTE_REGRA_NOME_FORMATO =
  'Nome deve usar apenas letras minúsculas, números e sublinhado (ex.: uma_pergunta_por_vez)';
export const AGENTE_REGRA_NOME_DUPLICADO = 'Já existe uma regra com este nome';

/** Modais "Nova Regra" e "Editar Regra": colunas do grid do inventário (campos a confirmar). */
export const agenteRegraInputSchema = z.strictObject({
  nome: textoObrigatorio('Nome', { max: AGENTE_REGRA_NOME_MAX }).regex(/^[a-z0-9_]+$/, {
    error: AGENTE_REGRA_NOME_FORMATO,
  }),
  descricao: textoObrigatorio('Descrição', { genero: 'f', max: AGENTE_TEXTO_MAX }),
  tipo: agenteRegraTipoSchema,
  gatilho: agenteRegraGatilhoSchema,
  acao: agenteRegraAcaoSchema,
  ativo: z.boolean({ error: 'Ativo inválido' }),
});
export type AgenteRegraFormulario = z.input<typeof agenteRegraInputSchema>;
export type CreateAgenteRegraInput = z.output<typeof agenteRegraInputSchema>;
export type UpdateAgenteRegraInput = CreateAgenteRegraInput;
export const createAgenteRegraSchema = agenteRegraInputSchema;
export const updateAgenteRegraSchema = agenteRegraInputSchema;

export const AGENTE_REGRA_SORT_FIELDS = ['nome', 'tipo', 'gatilho', 'acao', 'createdAt'] as const;
export const listAgenteRegraQuerySchema = listQuerySchema({
  sortFields: AGENTE_REGRA_SORT_FIELDS,
  defaultSort: 'createdAt:asc',
  filters: {
    status: ativoStatusSchema.optional(),
    tipo: agenteRegraTipoSchema.optional(),
    acao: agenteRegraAcaoSchema.optional(),
  },
});
export type ListAgenteRegraQuery = z.infer<typeof listAgenteRegraQuerySchema>;

export const agenteRegraSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  descricao: z.string(),
  tipo: agenteRegraTipoSchema,
  gatilho: agenteRegraGatilhoSchema,
  acao: agenteRegraAcaoSchema,
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AgenteRegra = z.infer<typeof agenteRegraSchema>;
export const agenteRegraPageSchema = paginatedResponseSchema(agenteRegraSchema);
export type AgenteRegraPage = z.infer<typeof agenteRegraPageSchema>;
