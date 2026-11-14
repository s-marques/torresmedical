import { z } from 'zod';
import { searchSchema } from '../common/list-query';
import { mensagemObrigatoria, textoObrigatorio } from '../common/obrigatorio';
import { MARCOS_ESTAGIO } from './crm-config';

/**
 * Negócio do CRM (tela Pipeline, `/crm`). A mesma entidade alimenta as telas Negócios (#7) e
 * Atividades (#2).
 */

export const NEGOCIO_TITULO_MAX = 200;
/** Cabe em DECIMAL(12,2). */
export const NEGOCIO_VALOR_MAX = 999_999_999;
export const ATIVIDADE_TITULO_MAX = 200;

export const NEGOCIO_STATUS = ['ABERTO', 'GANHO', 'PERDIDO'] as const;
export type NegocioStatus = (typeof NEGOCIO_STATUS)[number];

export const NEGOCIO_STATUS_ROTULO: Readonly<Record<NegocioStatus, string>> = {
  ABERTO: 'Aberto',
  GANHO: 'Ganho',
  PERDIDO: 'Perdido',
};

/** Campo "Paciente" do Novo Negócio: busca paciente ou profissional (lead médico). */
export const NEGOCIO_CONTATO_TIPOS = ['PACIENTE', 'PROFISSIONAL'] as const;
export type NegocioContatoTipo = (typeof NEGOCIO_CONTATO_TIPOS)[number];

export const NEGOCIO_CONTATO_ROTULO: Readonly<Record<NegocioContatoTipo, string>> = {
  PACIENTE: 'Paciente',
  PROFISSIONAL: 'Profissional',
};

export const ATIVIDADE_TIPOS = ['FOLLOW_UP', 'TAREFA', 'VISITA', 'ENVIO_PROPOSTA'] as const;
export type AtividadeTipo = (typeof ATIVIDADE_TIPOS)[number];

export const ATIVIDADE_TIPO_ROTULO: Readonly<Record<AtividadeTipo, string>> = {
  FOLLOW_UP: 'Follow-up',
  TAREFA: 'Tarefa',
  VISITA: 'Visita',
  ENVIO_PROPOSTA: 'Envio de proposta',
};

export const ATIVIDADE_STATUS = ['PENDENTE', 'CONCLUIDA'] as const;
export type AtividadeStatus = (typeof ATIVIDADE_STATUS)[number];

/**
 * Situação da próxima ação de um negócio aberto (requisito do cliente, seção 23): sem atividade
 * pendente ou com a próxima atrasada, o cartão aparece destacado.
 */
export const SITUACOES_ACAO = ['EM_DIA', 'SEM_ACAO', 'ATRASADA'] as const;
export type SituacaoAcao = (typeof SITUACOES_ACAO)[number];

export function situacaoProximaAcao(
  proxima: { dataHora: string } | null,
  agora: Date = new Date(),
): SituacaoAcao {
  if (!proxima) return 'SEM_ACAO';
  return Date.parse(proxima.dataHora) < agora.getTime() ? 'ATRASADA' : 'EM_DIA';
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const uuidOpcional = (mensagem: string) =>
  z
    .union([z.literal(''), z.uuid({ error: mensagem })])
    .nullish()
    .transform((valor) => valor || null);

const dataOpcional = z
  .union([z.iso.date({ error: 'Data inválida' }), z.literal('')])
  .nullish()
  .transform((valor) => valor || null);

/**
 * `POST /negocios` e `PATCH /negocios/:id`: modal "Novo Negócio". Só o Título é obrigatório
 * (asterisco do print); o Estágio vem preenchido com o primeiro do pipeline.
 */
export const negocioInputSchema = z.strictObject({
  titulo: textoObrigatorio('Título', { max: NEGOCIO_TITULO_MAX }),
  valor: z
    .number({ error: 'Informe um valor válido' })
    .min(0, { error: 'O valor não pode ser negativo' })
    .max(NEGOCIO_VALOR_MAX, { error: 'Valor muito alto' })
    .nullish()
    .transform((valor) => valor ?? null),
  estagioId: z.uuid({ error: mensagemObrigatoria('Estágio') }),
  contatoTipo: z
    .enum(NEGOCIO_CONTATO_TIPOS, { error: 'Tipo de contato inválido' })
    .default('PACIENTE'),
  contatoId: uuidOpcional('Contato inválido'),
  responsavelId: uuidOpcional('Responsável inválido'),
  previsaoFechamento: dataOpcional,
  origemClienteId: uuidOpcional('Origem inválida'),
});
export type NegocioInput = z.output<typeof negocioInputSchema>;
export type NegocioFormulario = z.input<typeof negocioInputSchema>;

/** `PATCH /negocios/:id/mover`: "Mover → <estágio>" e arrastar o cartão. */
export const moverNegocioSchema = z.strictObject({
  estagioId: z.uuid({ error: mensagemObrigatoria('Estágio') }),
});
export type MoverNegocioInput = z.output<typeof moverNegocioSchema>;

/** `PATCH /negocios/:id/perdido`: o motivo de perda é obrigatório. */
export const perderNegocioSchema = z.strictObject({
  motivoPerdaId: z.uuid({ error: mensagemObrigatoria('Motivo da perda') }),
});
export type PerderNegocioInput = z.output<typeof perderNegocioSchema>;
export type PerderNegocioFormulario = z.input<typeof perderNegocioSchema>;

/** `POST /negocios/:id/atividades`: "Agendar Follow-up". */
export const atividadeNegocioInputSchema = z.strictObject({
  tipo: z.enum(ATIVIDADE_TIPOS, { error: mensagemObrigatoria('Tipo') }).default('FOLLOW_UP'),
  titulo: textoObrigatorio('Título', { max: ATIVIDADE_TITULO_MAX }),
  data: z.iso.date({ error: mensagemObrigatoria('Data', 'f') }),
  hora: z
    .string({ error: mensagemObrigatoria('Hora', 'f') })
    .min(1, { error: mensagemObrigatoria('Hora', 'f'), abort: true })
    .regex(HORA, { error: 'Hora inválida (HH:MM)' }),
  responsavelId: uuidOpcional('Responsável inválido'),
});
export type AtividadeNegocioInput = z.output<typeof atividadeNegocioInputSchema>;
export type AtividadeNegocioFormulario = z.input<typeof atividadeNegocioInputSchema>;

/** `GET /quadro`: colunas do pipeline escolhido, com a busca do cabeçalho. */
export const quadroQuerySchema = z.object({
  pipelineId: z.uuid({ error: 'Pipeline inválido' }),
  search: searchSchema,
});
export type QuadroQuery = z.infer<typeof quadroQuerySchema>;

/** Valores monetários chegam como texto decimal (ex.: `"150.00"`), exatos como no banco. */
const decimal = z.string();

export const atividadeNegocioSchema = z.object({
  id: z.uuid(),
  negocioId: z.uuid(),
  tipo: z.enum(ATIVIDADE_TIPOS),
  titulo: z.string(),
  dataHora: z.iso.datetime(),
  responsavelId: z.uuid().nullable(),
  responsavel: z.string().nullable(),
  status: z.enum(ATIVIDADE_STATUS),
});
export type AtividadeNegocio = z.infer<typeof atividadeNegocioSchema>;

export const negocioSchema = z.object({
  id: z.uuid(),
  pipelineId: z.uuid(),
  estagioId: z.uuid(),
  titulo: z.string(),
  valor: decimal.nullable(),
  contatoTipo: z.enum(NEGOCIO_CONTATO_TIPOS).nullable(),
  contatoId: z.uuid().nullable(),
  /** Nome do paciente ou profissional. */
  contato: z.string().nullable(),
  responsavelId: z.uuid().nullable(),
  responsavel: z.string().nullable(),
  /** `AAAA-MM-DD`. */
  previsaoFechamento: z.string().nullable(),
  origemClienteId: z.uuid().nullable(),
  origem: z.string().nullable(),
  status: z.enum(NEGOCIO_STATUS),
  motivoPerdaId: z.uuid().nullable(),
  motivoPerda: z.string().nullable(),
  fechadoEm: z.iso.datetime().nullable(),
  /** Datas dos marcos do dashboard (primeira entrada num estágio com marco). */
  marcos: z.partialRecord(z.enum(MARCOS_ESTAGIO), z.iso.datetime()),
  /** Atividade pendente mais próxima. */
  proximaAtividade: atividadeNegocioSchema.nullable(),
  /** Só para negócio aberto; ganho e perdido não têm próxima ação. */
  situacaoAcao: z.enum(SITUACOES_ACAO).nullable(),
  createdAt: z.iso.datetime(),
});
export type Negocio = z.infer<typeof negocioSchema>;

export const colunaQuadroSchema = z.object({
  estagioId: z.uuid(),
  nome: z.string(),
  cor: z.string(),
  /** Negócios abertos na coluna. */
  quantidade: z.number().int(),
  total: decimal,
  negocios: z.array(negocioSchema),
});
export type ColunaQuadro = z.infer<typeof colunaQuadroSchema>;

const resumoStatusSchema = z.object({ quantidade: z.number().int(), total: decimal });

/** Cabeçalho ("Total: R$ … · N abertos · N ganhos · N perdidos") e rodapé (Ganhos/Perdidos). */
export const resumoQuadroSchema = z.object({
  abertos: resumoStatusSchema,
  ganhos: resumoStatusSchema,
  perdidos: resumoStatusSchema,
});
export type ResumoQuadro = z.infer<typeof resumoQuadroSchema>;

export const quadroSchema = z.object({
  pipelineId: z.uuid(),
  colunas: z.array(colunaQuadroSchema),
  resumo: resumoQuadroSchema,
});
export type Quadro = z.infer<typeof quadroSchema>;

/** `GET /responsaveis`: usuários ativos para o combobox "Responsavel". */
export const responsavelSchema = z.object({ id: z.uuid(), nome: z.string() });
export type Responsavel = z.infer<typeof responsavelSchema>;
export const responsavelListaSchema = z.array(responsavelSchema);
