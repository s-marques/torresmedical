import { z } from 'zod';
import { DIAS_SEMANA, minutosDoDia } from '../gestao-profissionais/profissional-agenda';

export { DIAS_SEMANA };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const hora = (rotulo: string) =>
  z.string({ error: `${rotulo} inválido` }).regex(HORA, { error: `${rotulo} inválido (HH:MM)` });

export const HORARIO_INTERVALOS_MAX = 5;

/** Uma pausa (ex.: almoço) dentro do expediente do dia. */
const intervaloInputSchema = z
  .strictObject({ inicio: hora('Início da pausa'), fim: hora('Fim da pausa') })
  .refine((i) => minutosDoDia(i.fim) > minutosDoDia(i.inicio), {
    error: 'O fim da pausa deve ser depois do início',
    path: ['fim'],
  });

/** Um dia da semana da aba Horários (0 = domingo … 6 = sábado). */
const diaHorarioInputSchema = z
  .strictObject({
    diaSemana: z.number({ error: 'Dia inválido' }).int().min(0).max(6),
    fechado: z.boolean().default(false),
    abre: hora('Abre').nullish(),
    fecha: hora('Fecha').nullish(),
    intervalos: z
      .array(intervaloInputSchema)
      .max(HORARIO_INTERVALOS_MAX, { error: `No máximo ${HORARIO_INTERVALOS_MAX} pausas` })
      .default([]),
  })
  .superRefine((dia, ctx) => {
    if (dia.fechado) return;
    if (!dia.abre)
      ctx.addIssue({ code: 'custom', path: ['abre'], message: 'Informe o horário de abertura' });
    if (!dia.fecha)
      ctx.addIssue({ code: 'custom', path: ['fecha'], message: 'Informe o horário de fechamento' });
    if (!dia.abre || !dia.fecha) return;
    const abre = minutosDoDia(dia.abre);
    const fecha = minutosDoDia(dia.fecha);
    if (fecha <= abre) {
      ctx.addIssue({
        code: 'custom',
        path: ['fecha'],
        message: 'O fechamento deve ser depois da abertura',
      });
      return;
    }
    let anterior = abre;
    dia.intervalos.forEach((intervalo, indice) => {
      const inicio = minutosDoDia(intervalo.inicio);
      const fim = minutosDoDia(intervalo.fim);
      if (inicio < anterior || fim > fecha) {
        ctx.addIssue({
          code: 'custom',
          path: ['intervalos', indice, 'inicio'],
          message: 'A pausa deve ficar dentro do horário de funcionamento',
        });
      }
      anterior = fim;
    });
  });

export type DiaHorarioInput = z.input<typeof diaHorarioInputSchema>;

/** `PUT /api/configuracoes-gestao/empresas/horarios` ("Salvar Horários"): substitui a semana inteira. */
export const salvarHorariosFuncionamentoSchema = z
  .strictObject({ dias: z.array(diaHorarioInputSchema).length(7, { error: 'Informe os 7 dias' }) })
  .refine((v) => new Set(v.dias.map((d) => d.diaSemana)).size === 7, {
    error: 'Cada dia da semana deve aparecer uma vez',
  });

export type SalvarHorariosFuncionamentoInput = z.output<typeof salvarHorariosFuncionamentoSchema>;

export const intervaloHorarioSchema = z.object({
  id: z.uuid(),
  inicio: z.string(),
  fim: z.string(),
});
export type IntervaloHorario = z.infer<typeof intervaloHorarioSchema>;

export const diaHorarioSchema = z.object({
  diaSemana: z.number().int(),
  fechado: z.boolean(),
  abre: z.string().nullable(),
  fecha: z.string().nullable(),
  intervalos: z.array(intervaloHorarioSchema),
});
export type DiaHorario = z.infer<typeof diaHorarioSchema>;

export const horariosFuncionamentoResponseSchema = z.object({ data: z.array(diaHorarioSchema) });
