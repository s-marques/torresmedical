import { z } from 'zod';
import { erroObrigatorio } from '../common/obrigatorio';

export const CONTRATO_HORA_OBSERVACAO_MAX = 300;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const horaSchema = (rotulo: string) =>
  z
    .string({ error: erroObrigatorio(rotulo, 'f') })
    .min(1, { error: erroObrigatorio(rotulo, 'f') })
    .regex(HORA, { error: `${rotulo} inválida` });

/**
 * Corpo de `POST /api/gestao-profissionais/contratos-sala/:id/horas`: o "Novo Lançamento" do
 * modal "Horas Utilizadas" (contratos de Hora Avulsa).
 */
export const contratoHoraInputSchema = z
  .strictObject({
    data: z
      .string({ error: erroObrigatorio('Data', 'f') })
      .min(1, { error: erroObrigatorio('Data', 'f') })
      .pipe(z.iso.date({ error: 'Data inválida' })),
    entrada: horaSchema('Hora de entrada'),
    saida: horaSchema('Hora de saída'),
    observacao: z
      .string({ error: 'Observação inválida' })
      .trim()
      .max(CONTRATO_HORA_OBSERVACAO_MAX, {
        error: `A observação deve ter no máximo ${CONTRATO_HORA_OBSERVACAO_MAX} caracteres`,
      })
      .nullish()
      .transform((valor) => valor || null),
  })
  .superRefine((hora, ctx) => {
    if (hora.saida <= hora.entrada) {
      ctx.addIssue({
        code: 'custom',
        path: ['saida'],
        message: 'A saída deve ser depois da entrada',
      });
    }
  });

export type ContratoHoraFormulario = z.input<typeof contratoHoraInputSchema>;
export type CreateContratoHoraInput = z.output<typeof contratoHoraInputSchema>;
export const createContratoHoraSchema = contratoHoraInputSchema;

/** `GET .../horas?mes=AAAA-MM`: o mês consultado. */
export const listContratoHorasQuerySchema = z.object({
  mes: z
    .string({ error: erroObrigatorio('Mês') })
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'Mês inválido. Use AAAA-MM' }),
});
export type ListContratoHorasQuery = z.infer<typeof listContratoHorasQuerySchema>;

export const contratoHoraSchema = z.object({
  id: z.uuid(),
  contratoId: z.uuid(),
  data: z.iso.date(),
  entrada: z.string(),
  saida: z.string(),
  duracaoMinutos: z.number().int(),
  observacao: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ContratoHora = z.infer<typeof contratoHoraSchema>;

export const contratoHorasResumoSchema = z.object({
  valorHora: z.number(),
  /** Horas contratadas por mês (`quantidadeMensal` do contrato). */
  horasContratadas: z.number().nullable(),
  minutosUtilizados: z.number().int(),
  /** Horas utilizadas × valor da hora. */
  valorTotal: z.number(),
});
export type ContratoHorasResumo = z.infer<typeof contratoHorasResumoSchema>;

export const contratoHorasResponseSchema = z.object({
  data: z.array(contratoHoraSchema),
  resumo: contratoHorasResumoSchema,
});
export type ContratoHorasResponse = z.infer<typeof contratoHorasResponseSchema>;

/** Minutos entre `entrada` e `saida` ("HH:MM"). */
export function minutosEntre(entrada: string, saida: string): number {
  const minutos = (hora: string) => {
    const [h = '0', m = '0'] = hora.split(':');
    return Number(h) * 60 + Number(m);
  };
  return Math.max(0, minutos(saida) - minutos(entrada));
}

/** `90` → `1h30`; `120` → `2h`; `45` → `0h45`. */
export function formatarDuracao(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, '0')}`;
}

/** Valor das horas utilizadas: `minutos / 60 × valorHora`, em centavos exatos. */
export function valorDasHoras(minutos: number, valorHora: number): number {
  return Math.round((minutos / 60) * valorHora * 100) / 100;
}
