import { z } from 'zod';
import {
  agendamentoStatusSchema,
  type AgendamentoStatus,
} from '../comercial-atendimento/agendamento';
import { pacienteSexoSchema } from '../comercial-atendimento/paciente';
import { listQuerySchema } from '../common/list-query';
import { erroObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';
import { lookupItemSchema } from '../lookups/lookup';
import { atendimentoStatusSchema } from './prontuario';

/**
 * Tela Atendimento Médico (`/atendimento-medico`, #38): agendamentos do dia com a ação
 * "Atender", e o detalhe do atendimento (abas Evolução e Dados).
 */

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(valor: string): boolean {
  if (!DATA.test(valor)) return false;
  const [ano, mes, dia] = valor.split('-').map(Number) as [number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  );
}

/** Opções do select "Todos os status", com os textos do inventário. */
export const ATENDIMENTO_MEDICO_STATUS_FILTRO = [
  'CONFIRMADO',
  'AGUARDANDO',
  'EM_ATENDIMENTO',
  'ATENDIDO',
] as const satisfies readonly AgendamentoStatus[];

export const ATENDIMENTO_MEDICO_STATUS_FILTRO_ROTULOS: Record<
  (typeof ATENDIMENTO_MEDICO_STATUS_FILTRO)[number],
  string
> = {
  CONFIRMADO: 'Confirmados',
  AGUARDANDO: 'Aguardando',
  EM_ATENDIMENTO: 'Em Atendimento',
  ATENDIDO: 'Realizados',
};

/** Status em que "Atender" fica desabilitado. */
export const ATENDIMENTO_MEDICO_STATUS_SEM_ATENDER = [
  'CANCELADO',
] as const satisfies readonly AgendamentoStatus[];

export function podeAtender(status: AgendamentoStatus): boolean {
  return !(ATENDIMENTO_MEDICO_STATUS_SEM_ATENDER as readonly AgendamentoStatus[]).includes(status);
}

export const ATENDIMENTO_MEDICO_SORT_FIELDS = ['inicio', 'paciente', 'profissional'] as const;

/** Até 100 agendamentos por dia numa página (a tela mostra o dia inteiro). */
export const ATENDIMENTO_MEDICO_PAGE_SIZE = 100;

/** `GET /api/consultorio-assistencial/atendimento-medico`: agendamentos de um dia. */
export const listAtendimentoMedicoQuerySchema = listQuerySchema({
  sortFields: ATENDIMENTO_MEDICO_SORT_FIELDS,
  defaultSort: 'inicio:asc',
  filters: {
    data: z
      .string({ error: erroObrigatorio('Data', 'f') })
      .trim()
      .min(1, { error: erroObrigatorio('Data', 'f') })
      .refine(dataValida, { error: 'Data inválida' }),
    profissionalId: z.uuid({ error: 'Profissional inválido' }).optional(),
    status: z.enum(ATENDIMENTO_MEDICO_STATUS_FILTRO, { error: 'Status inválido' }).optional(),
  },
});
export type ListAtendimentoMedicoQuery = z.infer<typeof listAtendimentoMedicoQuerySchema>;

/** Linha do grid: um agendamento do dia. */
export const atendimentoMedicoItemSchema = z.object({
  /** Id do agendamento. */
  id: z.uuid(),
  /** Coluna "Hora": início do agendamento. */
  inicio: z.iso.datetime(),
  pacienteId: z.uuid(),
  pacienteNome: z.string(),
  profissionalId: z.uuid(),
  profissionalNome: z.string(),
  /** Coluna "Procedimento": nome do tipo de agendamento ("-" quando não houver). */
  procedimento: z.string().nullable(),
  status: agendamentoStatusSchema,
  /** Coluna "Pgto". */
  pago: z.boolean(),
});
export type AtendimentoMedicoItem = z.infer<typeof atendimentoMedicoItemSchema>;

export const atendimentoMedicoPageSchema = paginatedResponseSchema(atendimentoMedicoItemSchema);
export type AtendimentoMedicoPage = z.infer<typeof atendimentoMedicoPageSchema>;

// --- Detalhe -----------------------------------------------------------------------------

/** Atendimento clínico aberto pelo "Atender"/"Iniciar Atendimento". */
export const atendimentoEmCursoSchema = z.object({
  id: z.uuid(),
  agendamentoId: z.uuid(),
  status: atendimentoStatusSchema,
  iniciadoEm: z.iso.datetime(),
  finalizadoEm: z.iso.datetime().nullable(),
});
export type AtendimentoEmCurso = z.infer<typeof atendimentoEmCursoSchema>;

/** `GET .../atendimento-medico/:agendamentoId`: cabeçalho do detalhe. */
export const atendimentoMedicoDetalheSchema = z.object({
  agendamento: atendimentoMedicoItemSchema,
  /** `null` enquanto o atendimento não foi iniciado. */
  atendimento: atendimentoEmCursoSchema.nullable(),
});
export type AtendimentoMedicoDetalhe = z.infer<typeof atendimentoMedicoDetalheSchema>;

// --- Aba Evolução ------------------------------------------------------------------------

/** Opções do select da "Nova Evolução", na ordem do inventário. */
export const EVOLUCAO_TIPOS = [
  'EVOLUCAO',
  'DIAGNOSTICO',
  'PRESCRICAO',
  'OBSERVACAO',
  'ENCAMINHAMENTO',
] as const;
export const evolucaoTipoSchema = z.enum(EVOLUCAO_TIPOS, { error: 'Tipo inválido' });
export type EvolucaoTipo = z.infer<typeof evolucaoTipoSchema>;

export const EVOLUCAO_TIPO_ROTULOS: Record<EvolucaoTipo, string> = {
  EVOLUCAO: 'Evolução/Anotação',
  DIAGNOSTICO: 'Diagnóstico',
  PRESCRICAO: 'Prescrição',
  OBSERVACAO: 'Observação',
  ENCAMINHAMENTO: 'Encaminhamento',
};

export const EVOLUCAO_TEXTO_MAX = 10_000;

/** Corpo de `POST .../atendimento-medico/:agendamentoId/evolucoes` ("Salvar Evolução"). */
export const evolucaoInputSchema = z.strictObject({
  tipo: evolucaoTipoSchema.default('EVOLUCAO'),
  texto: z
    .string({ error: erroObrigatorio('Evolução', 'f') })
    .trim()
    .min(1, { error: erroObrigatorio('Evolução', 'f') })
    .max(EVOLUCAO_TEXTO_MAX, {
      error: `A evolução deve ter no máximo ${EVOLUCAO_TEXTO_MAX} caracteres`,
    }),
});
export type EvolucaoFormulario = z.input<typeof evolucaoInputSchema>;
export type CreateEvolucaoInput = z.output<typeof evolucaoInputSchema>;

export const evolucaoSchema = z.object({
  id: z.uuid(),
  atendimentoId: z.uuid(),
  tipo: evolucaoTipoSchema,
  texto: z.string(),
  profissionalNome: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Evolucao = z.infer<typeof evolucaoSchema>;

/** "Histórico de Evoluções": evoluções do paciente, da mais recente para a mais antiga. */
export const evolucaoPageSchema = paginatedResponseSchema(evolucaoSchema);
export type EvolucaoPage = z.infer<typeof evolucaoPageSchema>;

// --- Aba Dados ---------------------------------------------------------------------------

/** `GET .../atendimento-medico/:agendamentoId/paciente`: aba "Dados" (somente leitura). */
export const pacienteDadosAtendimentoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  documento: z.string().nullable(),
  rg: z.string().nullable(),
  dataNascimento: z.iso.date().nullable(),
  sexo: pacienteSexoSchema.nullable(),
  telefone: z.string().nullable(),
  email: z.string().nullable(),
  /** Logradouro, número, complemento e bairro numa linha. */
  endereco: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  observacoes: z.string().nullable(),
});
export type PacienteDadosAtendimento = z.infer<typeof pacienteDadosAtendimentoSchema>;

// --- Aba Receita -------------------------------------------------------------------------

/** Select de validade da "Nova Receita Manual", em dias, na ordem do inventário. */
export const RECEITA_VALIDADES = [30, 60, 90, 180, 365] as const;
export type ReceitaValidade = (typeof RECEITA_VALIDADES)[number];

export const RECEITA_VALIDADE_ROTULOS: Record<ReceitaValidade, string> = {
  30: '30 dias',
  60: '60 dias',
  90: '90 dias',
  180: '180 dias',
  365: '1 ano',
};

export const RECEITA_TEXTO_MAX = 10_000;
export const RECEITA_OBSERVACOES_MAX = 2000;

/** Corpo de `POST .../atendimento-medico/:agendamentoId/receitas` ("Salvar Receita"). */
export const receitaInputSchema = z.strictObject({
  tipo: evolucaoTipoSchema.default('EVOLUCAO'),
  /** "Receita Amarela (Controlada)". */
  controlada: z.boolean({ error: 'Controlada inválida' }).default(false),
  /** O select do formulário envia texto; a API aceita número. */
  validadeDias: z.coerce
    .number({ error: 'Validade inválida' })
    .refine((v) => (RECEITA_VALIDADES as readonly number[]).includes(v), {
      error: 'Validade inválida',
    })
    .default(30),
  texto: z
    .string({ error: erroObrigatorio('Receita', 'f') })
    .trim()
    .min(1, { error: erroObrigatorio('Receita', 'f') })
    .max(RECEITA_TEXTO_MAX, {
      error: `A receita deve ter no máximo ${RECEITA_TEXTO_MAX} caracteres`,
    }),
  observacoes: z
    .string({ error: 'Observações inválidas' })
    .trim()
    .max(RECEITA_OBSERVACOES_MAX, {
      error: `As observações devem ter no máximo ${RECEITA_OBSERVACOES_MAX} caracteres`,
    })
    .optional()
    .transform((v) => v || null),
});
export type ReceitaFormulario = z.input<typeof receitaInputSchema>;
export type CreateReceitaInput = z.output<typeof receitaInputSchema>;

export const receitaSchema = z.object({
  id: z.uuid(),
  atendimentoId: z.uuid(),
  tipo: evolucaoTipoSchema,
  controlada: z.boolean(),
  validadeDias: z.number().int(),
  texto: z.string(),
  observacoes: z.string().nullable(),
  profissionalNome: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Receita = z.infer<typeof receitaSchema>;

/** "Receitas Anteriores": receitas do paciente, da mais recente para a mais antiga. */
export const receitaPageSchema = paginatedResponseSchema(receitaSchema);
export type ReceitaPage = z.infer<typeof receitaPageSchema>;

/** `GET .../atendimento-medico/protocolos`: "Selecionar Protocolo/Receita". */
export const listProtocolosReceitaQuerySchema = listQuerySchema({
  sortFields: ['nome'] as const,
  defaultSort: 'nome:asc',
  filters: {
    /** Select "Todas": categoria do protocolo. */
    categoria: z.string().trim().min(1).optional(),
  },
});
export type ListProtocolosReceitaQuery = z.infer<typeof listProtocolosReceitaQuerySchema>;

/** Protocolo escolhido: nome e observações entram no texto da receita. */
export const protocoloReceitaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  categoria: z.string(),
  texto: z.string().nullable(),
});
export type ProtocoloReceita = z.infer<typeof protocoloReceitaSchema>;

export const protocoloReceitaPageSchema = paginatedResponseSchema(protocoloReceitaSchema);
export type ProtocoloReceitaPage = z.infer<typeof protocoloReceitaPageSchema>;

/** Texto acrescentado à receita ao escolher um protocolo (nome e observações). */
export function textoDoProtocolo(protocolo: Pick<ProtocoloReceita, 'nome' | 'texto'>): string {
  return protocolo.texto ? `${protocolo.nome}\n${protocolo.texto}` : protocolo.nome;
}

// --- Aba Pagamento -----------------------------------------------------------------------

export const RECEBIMENTO_VALOR_MAX = 999_999_999;

/** Corpo de `POST .../atendimento-medico/:agendamentoId/recebimentos` ("Registrar Pagamento"). */
export const recebimentoInputSchema = z.strictObject({
  valor: z
    .number({ error: erroObrigatorio('Valor a receber') })
    .positive({ error: 'O valor a receber deve ser maior que zero' })
    .max(RECEBIMENTO_VALOR_MAX, { error: 'Valor inválido' }),
  formaPagamentoId: z.uuid({ error: erroObrigatorio('Forma de pagamento', 'f') }),
});
export type RecebimentoFormulario = z.input<typeof recebimentoInputSchema>;
export type CreateRecebimentoInput = z.output<typeof recebimentoInputSchema>;

export const recebimentoSchema = z.object({
  id: z.uuid(),
  agendamentoId: z.uuid(),
  valor: z.number(),
  formaPagamentoId: z.uuid(),
  formaPagamentoNome: z.string(),
  recebidoEm: z.iso.datetime(),
});
export type Recebimento = z.infer<typeof recebimentoSchema>;

/** `GET .../atendimento-medico/:agendamentoId/pagamento`: card "Registrar Recebimento". */
export const pagamentoAtendimentoSchema = z.object({
  /** "Valor da consulta"; `null` quando o agendamento não tem valor. */
  valorConsulta: z.number().nullable(),
  /** "Já recebido": soma dos recebimentos. */
  recebido: z.number(),
  /** "Saldo a receber"; `null` sem valor da consulta. */
  saldo: z.number().nullable(),
  pago: z.boolean(),
  recebimentos: z.array(recebimentoSchema),
  /** Opções de "Forma de Pagamento": de recebimento, sem cartão (lançado pela Agenda). */
  formasPagamento: z.array(lookupItemSchema),
});
export type PagamentoAtendimento = z.infer<typeof pagamentoAtendimentoSchema>;

// --- Aba Histórico -----------------------------------------------------------------------

/** Atendimento do paciente, com as evoluções e a quantidade de receitas. */
export const historicoAtendimentoSchema = z.object({
  id: z.uuid(),
  agendamentoId: z.uuid().nullable(),
  status: atendimentoStatusSchema,
  iniciadoEm: z.iso.datetime(),
  finalizadoEm: z.iso.datetime().nullable(),
  profissionalNome: z.string().nullable(),
  evolucoes: z.array(
    z.object({
      id: z.uuid(),
      tipo: evolucaoTipoSchema,
      texto: z.string(),
      createdAt: z.iso.datetime(),
    }),
  ),
  totalReceitas: z.number().int(),
});
export type HistoricoAtendimento = z.infer<typeof historicoAtendimentoSchema>;

/** `GET .../atendimento-medico/:agendamentoId/historico`: atendimentos do paciente, mais recente primeiro. */
export const historicoAtendimentoPageSchema = paginatedResponseSchema(historicoAtendimentoSchema);
export type HistoricoAtendimentoPage = z.infer<typeof historicoAtendimentoPageSchema>;
