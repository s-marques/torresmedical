import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { mensagemObrigatoria } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';
import {
  agendamentoStatusSchema,
  type AgendamentoStatus,
} from '../comercial-atendimento/agendamento';
import { pacienteSexoSchema } from '../comercial-atendimento/paciente';
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
      .string({ error: mensagemObrigatoria('Data', 'f') })
      .trim()
      .min(1, { error: mensagemObrigatoria('Data', 'f') })
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
    .string({ error: mensagemObrigatoria('Evolução', 'f') })
    .trim()
    .min(1, { error: mensagemObrigatoria('Evolução', 'f') })
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
