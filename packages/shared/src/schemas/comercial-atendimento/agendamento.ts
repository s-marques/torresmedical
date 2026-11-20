import { z } from 'zod';
import { erroObrigatorio } from '../common/obrigatorio';
import { profissionalCorSchema } from '../gestao-profissionais/profissional';

export const AGENDAMENTO_DURACAO_PADRAO = 30;
export const AGENDAMENTO_DURACAO_MAX = 1440;
export const AGENDAMENTO_OBSERVACOES_MAX = 2000;
export const AGENDAMENTO_VALOR_MAX = 99_999_999.99;
/** Maior intervalo (em dias) aceito na consulta do calendário. */
export const AGENDA_PERIODO_MAX_DIAS = 31;

/**
 * Status do agendamento. Agendado, Confirmado, Check-in, Cancelado e Reagendar vêm da legenda
 * da tela; Atendido e Faltou aparecem no modal de detalhe e nos botões do inventário.
 * Aguardando e Em Atendimento vêm do filtro da tela Atendimento Médico (#38), onde "Atender"
 * grava `EM_ATENDIMENTO`. A criação sempre grava `AGENDADO`.
 */
export const AGENDAMENTO_STATUS = [
  'AGENDADO',
  'CONFIRMADO',
  'CHECK_IN',
  'CANCELADO',
  'REAGENDAR',
  'ATENDIDO',
  'FALTOU',
  'AGUARDANDO',
  'EM_ATENDIMENTO',
] as const;
export const agendamentoStatusSchema = z.enum(AGENDAMENTO_STATUS, { error: 'Status inválido' });
export type AgendamentoStatus = z.infer<typeof agendamentoStatusSchema>;

export const AGENDAMENTO_STATUS_ROTULOS: Record<AgendamentoStatus, string> = {
  AGENDADO: 'Agendado',
  CONFIRMADO: 'Confirmado',
  CHECK_IN: 'Check-in',
  CANCELADO: 'Cancelado',
  REAGENDAR: 'Reagendar',
  ATENDIDO: 'Atendido',
  FALTOU: 'Faltou',
  AGUARDANDO: 'Aguardando',
  EM_ATENDIMENTO: 'Em Atendimento',
};

/** Ordem da legenda no rodapé da tela. */
export const AGENDAMENTO_STATUS_LEGENDA = [
  'AGENDADO',
  'CONFIRMADO',
  'CHECK_IN',
  'CANCELADO',
  'REAGENDAR',
] as const satisfies readonly AgendamentoStatus[];

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const MSG_PACIENTE = 'Selecione o paciente.';
const MSG_PROFISSIONAL = 'Selecione o profissional.';

const uuidObrigatorio = (mensagem: string) =>
  z.uuid({ error: mensagem }).min(1, { error: mensagem });

const valorOpcional = z
  .union([
    z.literal(''),
    z
      .number({ error: 'Valor inválido' })
      .min(0, { error: 'O valor não pode ser negativo' })
      .max(AGENDAMENTO_VALOR_MAX, { error: 'Valor muito alto' }),
  ])
  .nullish()
  .transform((valor) => (typeof valor === 'number' ? valor : null));

const duracaoSchema = z
  .number({ error: 'Informe a duração em minutos' })
  .int({ error: 'A duração deve ser um número inteiro de minutos' })
  .min(1, { error: 'A duração deve ser de pelo menos 1 minuto' })
  .max(AGENDAMENTO_DURACAO_MAX, {
    error: `A duração deve ser de no máximo ${AGENDAMENTO_DURACAO_MAX} minutos`,
  });

const horaSchema = z
  .string({ error: erroObrigatorio('Hora', 'f') })
  .regex(HORA, { error: 'Hora inválida (HH:MM)' });

const salaSchema = z.uuid({ error: erroObrigatorio('Sala', 'f') });

/** `POST /api/comercial-atendimento/agendamentos`: campos do modal "Novo Agendamento". */
export const createAgendamentoSchema = z.strictObject({
  pacienteId: uuidObrigatorio(MSG_PACIENTE),
  profissionalId: uuidObrigatorio(MSG_PROFISSIONAL),
  /** Sala obrigatória (issue #136): o agendamento ocupa uma sala no intervalo de horário. */
  salaId: salaSchema,
  data: z.iso.date({ error: erroObrigatorio('Data', 'f') }),
  hora: horaSchema,
  duracaoMinutos: duracaoSchema.default(AGENDAMENTO_DURACAO_PADRAO),
  tipoAgendamentoId: z
    .union([z.literal(''), z.uuid({ error: 'Tipo inválido' })])
    .nullish()
    .transform((valor) => valor || null),
  valor: valorOpcional,
  convenio: z.boolean({ error: 'Valor inválido' }).default(false),
  observacoes: z
    .string()
    .trim()
    .max(AGENDAMENTO_OBSERVACOES_MAX, {
      error: `As observações devem ter no máximo ${AGENDAMENTO_OBSERVACOES_MAX} caracteres`,
    })
    .nullish()
    .transform((valor) => valor || null),
});

export type CreateAgendamentoInput = z.infer<typeof createAgendamentoSchema>;
export type AgendamentoFormulario = z.input<typeof createAgendamentoSchema>;

/**
 * `PATCH /api/comercial-atendimento/agendamentos/:id`: reagendamento. Decisão do dev na #136:
 * a edição troca só sala, data, hora e duração, sempre com as mesmas validações da criação.
 */
export const updateAgendamentoSchema = z
  .strictObject({
    salaId: salaSchema.optional(),
    data: z.iso.date({ error: erroObrigatorio('Data', 'f') }).optional(),
    hora: horaSchema.optional(),
    duracaoMinutos: duracaoSchema.optional(),
  })
  .refine((v) => Object.values(v).some((campo) => campo !== undefined), {
    error: 'Informe ao menos um campo para alterar',
  });

export type UpdateAgendamentoInput = z.infer<typeof updateAgendamentoSchema>;
export type UpdateAgendamentoFormulario = z.input<typeof updateAgendamentoSchema>;

/** `GET /api/comercial-atendimento/agendamentos/sala-sugerida`: sala do contrato do profissional. */
export const salaSugeridaQuerySchema = z.strictObject({
  profissionalId: z.uuid({ error: 'Profissional inválido' }),
  data: z.iso.date({ error: erroObrigatorio('Data', 'f') }),
  hora: horaSchema,
});

export type SalaSugeridaQuery = z.infer<typeof salaSugeridaQuerySchema>;

export const salaSugeridaSchema = z.object({
  salaId: z.uuid().nullable(),
  salaNome: z.string().nullable(),
});

export type SalaSugerida = z.infer<typeof salaSugeridaSchema>;

/** `GET /api/comercial-atendimento/agendamentos`: intervalo do calendário (inclusive) e profissional. */
export const listAgendamentosQuerySchema = z
  .strictObject({
    inicio: z.iso.date({ error: 'Data inicial inválida' }),
    fim: z.iso.date({ error: 'Data final inválida' }),
    profissionalId: z.uuid({ error: 'Profissional inválido' }).optional(),
  })
  .superRefine((q, ctx) => {
    const dias = (Date.parse(q.fim) - Date.parse(q.inicio)) / 86_400_000;
    if (dias < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['fim'],
        message: 'A data final deve ser igual ou posterior à inicial',
      });
    } else if (dias >= AGENDA_PERIODO_MAX_DIAS) {
      ctx.addIssue({
        code: 'custom',
        path: ['fim'],
        message: `O período deve ter no máximo ${AGENDA_PERIODO_MAX_DIAS} dias`,
      });
    }
  });

export type ListAgendamentosQuery = z.infer<typeof listAgendamentosQuerySchema>;

export const agendamentoSchema = z.object({
  id: z.uuid(),
  /** Número exibido ao usuário ("Agendamento #1224"). */
  numero: z.number().int(),
  pacienteId: z.uuid(),
  pacienteNome: z.string(),
  profissionalId: z.uuid(),
  profissionalNome: z.string(),
  profissionalCor: profissionalCorSchema,
  /** Nula só nos agendamentos anteriores à #136, até alguém editar e escolher a sala. */
  salaId: z.uuid().nullable(),
  salaNome: z.string().nullable(),
  tipoAgendamentoId: z.uuid().nullable(),
  tipoNome: z.string().nullable(),
  /** Instante de início (ISO 8601, UTC). */
  inicio: z.iso.datetime(),
  duracaoMinutos: z.number().int(),
  valor: z.number().nullable(),
  convenio: z.boolean(),
  observacoes: z.string().nullable(),
  status: agendamentoStatusSchema,
});

export type Agendamento = z.infer<typeof agendamentoSchema>;

export const agendamentoListaSchema = z.object({ data: z.array(agendamentoSchema) });

export type AgendamentoLista = z.infer<typeof agendamentoListaSchema>;

/** Profissional ativo do calendário: coluna da visão Dia e opção do filtro. */
export const agendaProfissionalSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  especialidade: z.string().nullable(),
  cor: profissionalCorSchema,
});

export type AgendaProfissional = z.infer<typeof agendaProfissionalSchema>;

export const agendaProfissionaisSchema = z.object({ data: z.array(agendaProfissionalSchema) });
