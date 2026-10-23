import { z } from 'zod';
import { profissionalCorSchema } from '../gestao-profissionais/profissional';
import { mensagemObrigatoria } from '../common/obrigatorio';

export const AGENDAMENTO_DURACAO_PADRAO = 30;
export const AGENDAMENTO_DURACAO_MAX = 1440;
export const AGENDAMENTO_OBSERVACOES_MAX = 2000;
export const AGENDAMENTO_VALOR_MAX = 99_999_999.99;
/** Maior intervalo (em dias) aceito na consulta do calendário. */
export const AGENDA_PERIODO_MAX_DIAS = 31;

/**
 * Status do agendamento. Agendado, Confirmado, Check-in, Cancelado e Reagendar vêm da legenda
 * da tela; Atendido e Faltou aparecem no modal de detalhe e nos botões do inventário.
 * A criação sempre grava `AGENDADO`.
 */
export const AGENDAMENTO_STATUS = [
  'AGENDADO',
  'CONFIRMADO',
  'CHECK_IN',
  'CANCELADO',
  'REAGENDAR',
  'ATENDIDO',
  'FALTOU',
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

/** `POST /api/comercial-atendimento/agendamentos`: campos do modal "Novo Agendamento". */
export const createAgendamentoSchema = z.strictObject({
  pacienteId: uuidObrigatorio(MSG_PACIENTE),
  profissionalId: uuidObrigatorio(MSG_PROFISSIONAL),
  data: z.iso.date({ error: mensagemObrigatoria('Data', 'f') }),
  hora: z
    .string({ error: mensagemObrigatoria('Hora', 'f') })
    .regex(HORA, { error: 'Hora inválida (HH:MM)' }),
  duracaoMinutos: z
    .number({ error: 'Informe a duração em minutos' })
    .int({ error: 'A duração deve ser um número inteiro de minutos' })
    .min(1, { error: 'A duração deve ser de pelo menos 1 minuto' })
    .max(AGENDAMENTO_DURACAO_MAX, {
      error: `A duração deve ser de no máximo ${AGENDAMENTO_DURACAO_MAX} minutos`,
    })
    .default(AGENDAMENTO_DURACAO_PADRAO),
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
