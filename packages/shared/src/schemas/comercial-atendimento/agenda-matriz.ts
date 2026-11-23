import { z } from 'zod';
import { adicionarDias, segundaDaSemana } from '../gestao-profissionais/sala-painel';
import { SALA_BLOQUEIO_TIPOS } from '../gestao-profissionais/sala-bloqueio';
import { agendamentoStatusSchema } from './agendamento';

/** Visões da Agenda matricial (issue #137): dia (colunas de 1 h), semana e mês (colunas por turno). */
export const MATRIZ_VISOES = ['dia', 'semana', 'mes'] as const;
export const matrizVisaoSchema = z.enum(MATRIZ_VISOES, { error: 'Visão inválida' });
export type MatrizVisao = z.infer<typeof matrizVisaoSchema>;

/**
 * Turnos da clínica (decisão do dev na #137): manhã até 12h, tarde das 12h às 18h e noite depois
 * das 18h. Valores em minutos desde as 00:00 (`fim` exclusivo).
 */
export const MATRIZ_TURNOS = ['MANHA', 'TARDE', 'NOITE'] as const;
export const matrizTurnoSchema = z.enum(MATRIZ_TURNOS, { error: 'Turno inválido' });
export type MatrizTurno = z.infer<typeof matrizTurnoSchema>;

export const MATRIZ_TURNO_FAIXAS: Readonly<Record<MatrizTurno, { inicio: number; fim: number }>> = {
  MANHA: { inicio: 0, fim: 12 * 60 },
  TARDE: { inicio: 12 * 60, fim: 18 * 60 },
  NOITE: { inicio: 18 * 60, fim: 24 * 60 },
};

/** Faixa de horas exibida por padrão na visão Dia; amplia sozinha se houver algo fora dela. */
export const MATRIZ_HORA_INICIAL_PADRAO = 7;
export const MATRIZ_HORA_FINAL_PADRAO = 20;

/**
 * Estado de uma célula (sala × dia × coluna). A prioridade, do mais forte ao mais fraco, é a da
 * ordem de `MATRIZ_STATUS_PRIORIDADE`: bloqueios e reservas da sala vencem o agendamento, que
 * vence o período contratado, que vence o horário livre.
 */
export const MATRIZ_STATUS = [
  'DISPONIVEL',
  'CONTRATADO',
  'AGENDADO',
  ...SALA_BLOQUEIO_TIPOS,
] as const;
export const matrizStatusSchema = z.enum(MATRIZ_STATUS);
export type MatrizStatus = z.infer<typeof matrizStatusSchema>;

export const MATRIZ_STATUS_PRIORIDADE: readonly MatrizStatus[] = [
  'MANUTENCAO',
  'BLOQUEIO',
  'RESERVA',
  'USO_AVULSO',
  'CORTESIA',
  'AGENDADO',
  'CONTRATADO',
  'DISPONIVEL',
];

/**
 * Filtro por situação: período contratado, contratado sem uso, disponível, agendado, reservado
 * (reserva, cortesia e uso avulso) e bloqueado (bloqueio e manutenção).
 */
export const MATRIZ_SITUACOES = [
  'CONTRATADO',
  'SEM_USO',
  'DISPONIVEL',
  'AGENDADO',
  'RESERVADO',
  'BLOQUEADO',
] as const;
export const matrizSituacaoSchema = z.enum(MATRIZ_SITUACOES, { error: 'Situação inválida' });
export type MatrizSituacao = z.infer<typeof matrizSituacaoSchema>;

/** `GET /api/comercial-atendimento/agenda-matriz`. Sem `data`, vale hoje (fuso da clínica). */
export const agendaMatrizQuerySchema = z.strictObject({
  visao: matrizVisaoSchema.default('semana'),
  data: z.iso.date({ error: 'Data inválida' }).optional(),
  profissionalId: z.uuid({ error: 'Profissional inválido' }).optional(),
  especialidadeId: z.uuid({ error: 'Especialidade inválida' }).optional(),
  salaId: z.uuid({ error: 'Sala inválida' }).optional(),
  turno: matrizTurnoSchema.optional(),
  situacao: matrizSituacaoSchema.optional(),
});
export type AgendaMatrizQuery = z.infer<typeof agendaMatrizQuerySchema>;
export type AgendaMatrizFiltros = z.input<typeof agendaMatrizQuerySchema>;

const hhmm = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/);

export const agendaMatrizColunaSchema = z.object({
  /** `HH:MM` do início da hora (visão Dia) ou o turno (semana e mês). */
  chave: z.string(),
  inicio: hhmm,
  fim: hhmm,
  turno: matrizTurnoSchema,
});
export type AgendaMatrizColuna = z.infer<typeof agendaMatrizColunaSchema>;

/** O que ocupa a célula. Para o usuário restrito, o de outro profissional vem `oculto`, sem nomes. */
export const agendaMatrizItemSchema = z.object({
  tipo: z.enum(['CONTRATO', 'AGENDAMENTO', 'BLOQUEIO']),
  id: z.uuid(),
  inicio: hhmm,
  fim: hhmm,
  /** Locatário do contrato, profissional do agendamento ou profissional do bloqueio. */
  nome: z.string().nullable(),
  /** Só no contrato: valor total mensal. */
  valorMensal: z.number().nullable(),
  bloqueioTipo: z.enum(SALA_BLOQUEIO_TIPOS).nullable(),
  agendamentoStatus: agendamentoStatusSchema.nullable(),
  oculto: z.boolean(),
});
export type AgendaMatrizItem = z.infer<typeof agendaMatrizItemSchema>;

export const agendaMatrizCelulaSchema = z.object({
  data: z.iso.date(),
  coluna: z.string(),
  status: matrizStatusSchema,
  /** Período contratado sem nenhum agendamento na sala: o destaque da tela. */
  semUso: z.boolean(),
  itens: z.array(agendaMatrizItemSchema),
});
export type AgendaMatrizCelula = z.infer<typeof agendaMatrizCelulaSchema>;

export const agendaMatrizSchema = z.object({
  visao: matrizVisaoSchema,
  inicio: z.iso.date(),
  fim: z.iso.date(),
  dias: z.array(z.iso.date()),
  colunas: z.array(agendaMatrizColunaSchema),
  salas: z.array(
    z.object({
      salaId: z.uuid(),
      salaNome: z.string(),
      /** Só as células que atendem aos filtros; as demais ficam em branco na grade. */
      celulas: z.array(agendaMatrizCelulaSchema),
    }),
  ),
});
export type AgendaMatriz = z.infer<typeof agendaMatrizSchema>;

/** Primeiro e último dia do período de `data` na visão (semana de segunda a domingo; mês civil). */
export function periodoDaMatriz(visao: MatrizVisao, data: string): { inicio: string; fim: string } {
  if (visao === 'dia') return { inicio: data, fim: data };
  if (visao === 'semana') {
    const segunda = segundaDaSemana(data);
    return { inicio: segunda, fim: adicionarDias(segunda, 6) };
  }
  const [ano = 0, mes = 1] = data.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const prefixo = data.slice(0, 7);
  return { inicio: `${prefixo}-01`, fim: `${prefixo}-${String(ultimo).padStart(2, '0')}` };
}

/** Data de referência da visão anterior (`-1`) ou da próxima (`1`). */
export function deslocarMatriz(visao: MatrizVisao, data: string, sentido: -1 | 1): string {
  if (visao === 'dia') return adicionarDias(data, sentido);
  if (visao === 'semana') return adicionarDias(data, 7 * sentido);
  const [ano = 0, mes = 1] = data.split('-').map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + sentido, 1));
  return alvo.toISOString().slice(0, 10);
}

/** Turno a que pertence o minuto do dia (0 a 1439). */
export function turnoDoMinuto(minuto: number): MatrizTurno {
  return MATRIZ_TURNOS.find((t) => minuto < MATRIZ_TURNO_FAIXAS[t].fim) ?? 'NOITE';
}
