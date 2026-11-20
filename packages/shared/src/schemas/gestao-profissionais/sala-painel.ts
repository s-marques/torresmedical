import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Locatário de uma sala hoje: um contrato ativo e vigente (cards da aba Salas). */
export const salaLocatarioSchema = z.object({
  contratoId: z.uuid(),
  nome: z.string(),
  /** Valor total mensal do contrato. */
  valorTotalMensal: z.number(),
});
export type SalaLocatario = z.infer<typeof salaLocatarioSchema>;

/** `GET /api/gestao-profissionais/salas/ocupacao`: semana (segunda a domingo) que contém `inicio`. */
export const salaOcupacaoQuerySchema = z.object({
  inicio: z.iso.date({ error: 'Data inválida' }).optional(),
});
export type SalaOcupacaoQuery = z.infer<typeof salaOcupacaoQuerySchema>;

export const salaOcupacaoBlocoSchema = z.object({
  contratoId: z.uuid(),
  data: z.iso.date(),
  locatarioNome: z.string(),
  inicio: hhmm,
  fim: hhmm,
});
export type SalaOcupacaoBloco = z.infer<typeof salaOcupacaoBlocoSchema>;

/**
 * Um dia de bloqueio ou reserva da sala no Mapa (issue #138). `fim` pode ser "24:00". Para o
 * usuário restrito, o bloqueio de outro profissional vem `oculto`, sem o nome do profissional.
 */
export const salaOcupacaoBloqueioSchema = z.object({
  bloqueioId: z.uuid(),
  tipo: z.enum(['BLOQUEIO', 'MANUTENCAO', 'RESERVA', 'CORTESIA', 'USO_AVULSO']),
  data: z.iso.date(),
  inicio: hhmm,
  fim: z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/),
  profissionalNome: z.string().nullable(),
  oculto: z.boolean(),
});
export type SalaOcupacaoBloqueio = z.infer<typeof salaOcupacaoBloqueioSchema>;

export const salaOcupacaoSchema = z.object({
  /** Segunda-feira da semana. */
  inicio: z.iso.date(),
  /** Domingo da semana. */
  fim: z.iso.date(),
  salas: z.array(
    z.object({
      salaId: z.uuid(),
      salaNome: z.string(),
      blocos: z.array(salaOcupacaoBlocoSchema),
      /** Bloqueios e reservas ativos da sala na semana (issue #138). */
      bloqueios: z.array(salaOcupacaoBloqueioSchema),
    }),
  ),
});
export type SalaOcupacao = z.infer<typeof salaOcupacaoSchema>;

/** `GET /api/gestao-profissionais/salas/dashboard`: `data` é o dia de referência (padrão: hoje). */
export const salaDashboardQuerySchema = z.object({
  data: z.iso.date({ error: 'Data inválida' }).optional(),
});
export type SalaDashboardQuery = z.infer<typeof salaDashboardQuerySchema>;

export const salaDashboardSchema = z.object({
  data: z.iso.date(),
  totalSalas: z.number().int(),
  /**
   * Salas com algum contrato ativo e vigente na data ou com reserva/uso avulso ativo no dia
   * (issue #138; cortesia não conta).
   */
  ocupadas: z.number().int(),
  disponiveis: z.number().int(),
  /** Ocupadas ÷ total de salas, em %, com uma casa decimal. */
  taxaOcupacao: z.number(),
  /** Soma dos valores totais mensais dos contratos ativos e vigentes, exceto permuta. */
  receitaMensalTotal: z.number(),
  receitaPorSala: z.array(z.object({ salaId: z.uuid(), salaNome: z.string(), valor: z.number() })),
});
export type SalaDashboard = z.infer<typeof salaDashboardSchema>;

/** Ordem natural dos nomes: "Sala 2" antes de "Sala 10". */
export function compararNomesSala(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

/** Soma `dias` a uma data `AAAA-MM-DD` (sem fuso horário). */
export function adicionarDias(data: string, dias: number): string {
  const base = new Date(`${data}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/** Dia da semana de uma data `AAAA-MM-DD` (0 = domingo). */
export function diaDaSemana(data: string): number {
  return new Date(`${data}T00:00:00.000Z`).getUTCDay();
}

/** Segunda-feira da semana que contém a data `AAAA-MM-DD`. */
export function segundaDaSemana(data: string): string {
  return adicionarDias(data, -((diaDaSemana(data) + 6) % 7));
}
