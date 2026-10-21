import { z } from 'zod';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const hora = (rotulo: string) =>
  z.string({ error: `${rotulo} inválido` }).regex(HORA, { error: `${rotulo} inválido (HH:MM)` });

const horaOpcional = (rotulo: string) =>
  z
    .union([z.literal(''), hora(rotulo)])
    .nullish()
    .transform((valor) => valor || null);

/** "HH:MM" em minutos desde 00:00, para comparar horários. */
export function minutosDoDia(valor: string): number {
  const [h = '0', m = '0'] = valor.split(':');
  return Number(h) * 60 + Number(m);
}

export const HORARIO_TIPOS = ['SEMANAL', 'POR_DATA'] as const;
export const horarioTipoSchema = z.enum(HORARIO_TIPOS, { error: 'Tipo de horário inválido' });
export type HorarioTipo = z.infer<typeof horarioTipoSchema>;

/** 0 = domingo … 6 = sábado (mesma convenção de `Date#getDay`). */
export const DIAS_SEMANA = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

export const HORARIOS_MAX = 50;

const horarioBase = z.strictObject({
  tipo: horarioTipoSchema,
  /** Só no horário semanal. */
  diaSemana: z
    .number({ error: 'Selecione o dia' })
    .int()
    .min(0, { error: 'Selecione o dia' })
    .max(6, { error: 'Selecione o dia' })
    .nullish()
    .transform((valor) => valor ?? null),
  /** Só no horário por data (`AAAA-MM-DD`). */
  data: z
    .union([z.literal(''), z.iso.date({ error: 'Data inválida' })])
    .nullish()
    .transform((valor) => valor || null),
  inicio: hora('Início'),
  fim: hora('Fim'),
  almocoInicio: horaOpcional('Almoço de'),
  almocoFim: horaOpcional('Almoço até'),
});

/** Uma linha de "Horários de Atendimento" (Semanal: dia da semana; Por Data: data). */
export const horarioAtendimentoInputSchema = horarioBase.superRefine((h, ctx) => {
  if (h.tipo === 'SEMANAL' && h.diaSemana === null) {
    ctx.addIssue({ code: 'custom', path: ['diaSemana'], message: 'Selecione o dia' });
  }
  if (h.tipo === 'POR_DATA' && h.data === null) {
    ctx.addIssue({ code: 'custom', path: ['data'], message: 'Informe a data' });
  }
  // Horas mal formatadas já têm a própria mensagem; as regras abaixo comparam horas válidas.
  if (
    ![h.inicio, h.fim, h.almocoInicio ?? '00:00', h.almocoFim ?? '00:00'].every((v) => HORA.test(v))
  ) {
    return;
  }
  if (minutosDoDia(h.fim) <= minutosDoDia(h.inicio)) {
    ctx.addIssue({
      code: 'custom',
      path: ['fim'],
      message: 'O fim deve ser depois do início',
    });
  }
  if ((h.almocoInicio === null) !== (h.almocoFim === null)) {
    ctx.addIssue({
      code: 'custom',
      path: [h.almocoInicio === null ? 'almocoInicio' : 'almocoFim'],
      message: 'Informe o início e o fim do almoço',
    });
  } else if (h.almocoInicio !== null && h.almocoFim !== null) {
    const ini = minutosDoDia(h.almocoInicio);
    const fim = minutosDoDia(h.almocoFim);
    if (fim <= ini || ini < minutosDoDia(h.inicio) || fim > minutosDoDia(h.fim)) {
      ctx.addIssue({
        code: 'custom',
        path: ['almocoFim'],
        message: 'O almoço deve ficar dentro do horário de atendimento',
      });
    }
  }
});

export type HorarioAtendimentoInput = z.input<typeof horarioAtendimentoInputSchema>;

/** `PUT /api/gestao-profissionais/profissionais/:id/horarios` ("Salvar Horários"): substitui a lista. */
export const salvarHorariosSchema = z
  .strictObject({
    horarios: z
      .array(horarioAtendimentoInputSchema)
      .max(HORARIOS_MAX, { error: `No máximo ${HORARIOS_MAX} horários` }),
  })
  .superRefine(({ horarios }, ctx) => {
    const vistos = new Set<string>();
    horarios.forEach((h, indice) => {
      const chave = `${h.tipo}:${h.tipo === 'SEMANAL' ? h.diaSemana : h.data}`;
      if (vistos.has(chave)) {
        ctx.addIssue({
          code: 'custom',
          path: ['horarios', indice, h.tipo === 'SEMANAL' ? 'diaSemana' : 'data'],
          message: h.tipo === 'SEMANAL' ? 'Dia já cadastrado' : 'Data já cadastrada',
        });
      }
      vistos.add(chave);
    });
  });

export type SalvarHorariosInput = z.output<typeof salvarHorariosSchema>;

export const horarioAtendimentoSchema = z.object({
  id: z.uuid(),
  tipo: horarioTipoSchema,
  diaSemana: z.number().int().nullable(),
  data: z.iso.date().nullable(),
  inicio: z.string(),
  fim: z.string(),
  almocoInicio: z.string().nullable(),
  almocoFim: z.string().nullable(),
});

export type HorarioAtendimento = z.infer<typeof horarioAtendimentoSchema>;

export const horariosResponseSchema = z.object({ data: z.array(horarioAtendimentoSchema) });

// ---------------------------------------------------------------------------------------------
// Bloqueios de agenda

export const BLOQUEIO_MOTIVOS = [
  'FERIAS',
  'FOLGA',
  'CONGRESSO_CURSO',
  'ATESTADO_MEDICO',
  'FERIADO',
  'REUNIAO',
  'OUTRO',
] as const;
export const bloqueioMotivoSchema = z.enum(BLOQUEIO_MOTIVOS, { error: 'Selecione o motivo' });
export type BloqueioMotivo = z.infer<typeof bloqueioMotivoSchema>;

export const BLOQUEIO_MOTIVO_ROTULOS: Record<BloqueioMotivo, string> = {
  FERIAS: 'Férias',
  FOLGA: 'Folga',
  CONGRESSO_CURSO: 'Congresso / Curso',
  ATESTADO_MEDICO: 'Atestado Médico',
  FERIADO: 'Feriado',
  REUNIAO: 'Reunião',
  OUTRO: 'Outro',
};

export const BLOQUEIO_TIPOS = ['DIA_INTEIRO', 'HORARIO'] as const;
export const bloqueioTipoSchema = z.enum(BLOQUEIO_TIPOS, { error: 'Tipo de bloqueio inválido' });
export type BloqueioTipo = z.infer<typeof bloqueioTipoSchema>;

const dataObrigatoria = (rotulo: string) => z.iso.date({ error: `${rotulo} é obrigatória` });

/**
 * `POST /api/gestao-profissionais/profissionais/:id/bloqueios`. "Data Única" envia só `dataInicio`
 * (com tipo dia inteiro ou horário específico); "Lote (período)" envia `dataInicio` e `dataFim`
 * e sempre bloqueia os dias inteiros.
 */
export const criarBloqueioSchema = z
  .strictObject({
    dataInicio: dataObrigatoria('Data'),
    dataFim: z
      .union([z.literal(''), z.iso.date({ error: 'Data fim inválida' })])
      .nullish()
      .transform((valor) => valor || null),
    tipo: bloqueioTipoSchema.default('DIA_INTEIRO'),
    horaInicio: horaOpcional('Hora inicial'),
    horaFim: horaOpcional('Hora final'),
    motivo: bloqueioMotivoSchema,
  })
  .superRefine((b, ctx) => {
    if (b.dataFim !== null && b.dataFim < b.dataInicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataFim'],
        message: 'A data fim deve ser igual ou posterior à data início',
      });
    }
    if (b.tipo === 'HORARIO') {
      if (b.dataFim !== null && b.dataFim !== b.dataInicio) {
        ctx.addIssue({
          code: 'custom',
          path: ['tipo'],
          message: 'Horário específico vale para uma data só',
        });
      }
      if (b.horaInicio === null) {
        ctx.addIssue({ code: 'custom', path: ['horaInicio'], message: 'Informe a hora inicial' });
      }
      if (b.horaFim === null) {
        ctx.addIssue({ code: 'custom', path: ['horaFim'], message: 'Informe a hora final' });
      }
      if (
        b.horaInicio !== null &&
        b.horaFim !== null &&
        minutosDoDia(b.horaFim) <= minutosDoDia(b.horaInicio)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['horaFim'],
          message: 'A hora final deve ser depois da inicial',
        });
      }
    }
  })
  .transform((b) =>
    b.tipo === 'DIA_INTEIRO'
      ? { ...b, dataFim: b.dataFim ?? b.dataInicio, horaInicio: null, horaFim: null }
      : { ...b, dataFim: b.dataInicio },
  );

export type CriarBloqueioInput = z.input<typeof criarBloqueioSchema>;
export type CriarBloqueioData = z.output<typeof criarBloqueioSchema>;

export const bloqueioAgendaSchema = z.object({
  id: z.uuid(),
  dataInicio: z.iso.date(),
  dataFim: z.iso.date(),
  tipo: bloqueioTipoSchema,
  horaInicio: z.string().nullable(),
  horaFim: z.string().nullable(),
  motivo: bloqueioMotivoSchema,
  createdAt: z.iso.datetime(),
});

export type BloqueioAgenda = z.infer<typeof bloqueioAgendaSchema>;

export const bloqueiosResponseSchema = z.object({ data: z.array(bloqueioAgendaSchema) });
