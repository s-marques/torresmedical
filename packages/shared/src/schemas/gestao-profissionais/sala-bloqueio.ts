import { z } from 'zod';
import { traduzirValidacao } from '../../i18n/validacao';
import { dataSchemaOpcional } from '../comercial-atendimento/periodo-vendas';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { erroObrigatorio, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';
import { abreviarDiaSemana } from './contrato-sala';
import { adicionarDias, diaDaSemana } from './sala-painel';

/**
 * Bloqueios e reservas da sala (issue #138): a sala, e não só o profissional, fica indisponível
 * ou reservada num período. Decisões do dev na issue: recorrência por dias da semana (como o
 * contrato), responsável = usuário que registrou + profissional opcional, sobreposição recusada
 * só entre bloqueios da mesma sala, uso avulso sem cobrança, cancelamento sem excluir o registro.
 */

// --- Tipos e status ----------------------------------------------------------------------

export const SALA_BLOQUEIO_TIPOS = [
  'BLOQUEIO',
  'MANUTENCAO',
  'RESERVA',
  'CORTESIA',
  'USO_AVULSO',
] as const;
export const salaBloqueioTipoSchema = z.enum(SALA_BLOQUEIO_TIPOS, {
  error: () => traduzirValidacao('validacao.opcaoInvalida'),
});
export type SalaBloqueioTipo = (typeof SALA_BLOQUEIO_TIPOS)[number];

/** Rótulos em português (exportação e mensagens da API). A tela usa as traduções. */
export const SALA_BLOQUEIO_TIPO_ROTULOS: Readonly<Record<SalaBloqueioTipo, string>> = {
  BLOQUEIO: 'Bloqueio',
  MANUTENCAO: 'Manutenção',
  RESERVA: 'Reserva',
  CORTESIA: 'Cortesia',
  USO_AVULSO: 'Uso avulso',
};

/**
 * Tipos que contam a sala como ocupada no Dashboard (decisão do dev na #138). Cortesia não entra
 * na taxa; bloqueio e manutenção não mudam o total de salas.
 */
export const SALA_BLOQUEIO_TIPOS_OCUPAM: readonly SalaBloqueioTipo[] = ['RESERVA', 'USO_AVULSO'];

/** Ativo até ser cancelado. Não há exclusão: o cancelamento guarda quem, quando e o motivo. */
export const SALA_BLOQUEIO_STATUS = ['ATIVO', 'CANCELADO'] as const;
export const salaBloqueioStatusSchema = z.enum(SALA_BLOQUEIO_STATUS, {
  error: () => traduzirValidacao('validacao.opcaoInvalida'),
});
export type SalaBloqueioStatus = (typeof SALA_BLOQUEIO_STATUS)[number];

export const SALA_BLOQUEIO_STATUS_ROTULOS: Readonly<Record<SalaBloqueioStatus, string>> = {
  ATIVO: 'Ativo',
  CANCELADO: 'Cancelado',
};

export const SALA_BLOQUEIO_MOTIVO_MAX = 500;
/** Horário sugerido no formulário. */
export const SALA_BLOQUEIO_HORARIO_PADRAO = { inicio: '08:00', fim: '18:00' } as const;
/** Fim do dia nas ocorrências (o período único que atravessa a meia-noite). */
export const FIM_DO_DIA = '24:00';
export const INICIO_DO_DIA = '00:00';

// --- Helpers de campo --------------------------------------------------------------------

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const erroHora = () => traduzirValidacao('validacao.formato.time');

const horaOpcional = z
  .string({ error: erroHora })
  .nullish()
  .transform((valor) => valor || null)
  .pipe(z.string().regex(HORA, { error: erroHora }).nullable());

const dataObrigatoria = (rotulo: string) =>
  z
    .string({ error: erroObrigatorio(rotulo, 'f') })
    .min(1, { error: erroObrigatorio(rotulo, 'f') })
    .pipe(z.iso.date({ error: () => traduzirValidacao('validacao.formato.date') }));

const uuidObrigatorio = (rotulo: string, genero: 'm' | 'f') =>
  z
    .string({ error: erroObrigatorio(rotulo, genero) })
    .min(1, { error: erroObrigatorio(rotulo, genero) })
    .pipe(z.uuid({ error: () => traduzirValidacao('validacao.formato.uuid') }));

const motivoOpcional = z
  .string()
  .trim()
  .max(SALA_BLOQUEIO_MOTIVO_MAX, {
    error: () =>
      traduzirValidacao('validacao.campoMax', { campo: 'Motivo', count: SALA_BLOQUEIO_MOTIVO_MAX }),
  })
  .nullish()
  .transform((valor) => valor || null);

const diaInvalido = () => traduzirValidacao('validacao.salaBloqueio.diaInvalido');

export const salaBloqueioDiaSchema = z.strictObject({
  diaSemana: z
    .number({ error: diaInvalido })
    .int({ error: diaInvalido })
    .min(0, { error: diaInvalido })
    .max(6, { error: diaInvalido }),
  inicio: z.string({ error: erroHora }).regex(HORA, { error: erroHora }),
  fim: z.string({ error: erroHora }).regex(HORA, { error: erroHora }),
});
export type SalaBloqueioDia = z.infer<typeof salaBloqueioDiaSchema>;

// --- Criação e alteração -----------------------------------------------------------------

/**
 * Corpo de `POST` e `PATCH /api/gestao-profissionais/salas-bloqueios`.
 * - Período único (`recorrente: false`): de `dataInicio horaInicio` a `dataFim horaFim`, contínuo.
 * - Recorrente: entre `dataInicio` e `dataFim`, nos dias da semana de `dias`, cada um com o horário.
 */
export const salaBloqueioInputSchema = z
  .strictObject({
    salaId: uuidObrigatorio('Sala', 'f'),
    tipo: z
      .string({ error: erroObrigatorio('Tipo') })
      .min(1, { error: erroObrigatorio('Tipo') })
      .pipe(salaBloqueioTipoSchema),
    profissionalId: z
      .string({ error: () => traduzirValidacao('validacao.formato.uuid') })
      .nullish()
      .transform((valor) => valor || null)
      .pipe(z.uuid({ error: () => traduzirValidacao('validacao.formato.uuid') }).nullable()),
    recorrente: z.boolean().default(false),
    dataInicio: dataObrigatoria('Data inicial'),
    dataFim: dataObrigatoria('Data final'),
    horaInicio: horaOpcional,
    horaFim: horaOpcional,
    dias: z.array(salaBloqueioDiaSchema).default([]),
    motivo: motivoOpcional,
  })
  .superRefine((b, ctx) => {
    if (b.dataFim < b.dataInicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataFim'],
        message: traduzirValidacao('validacao.periodo.invalido'),
      });
    }
    if (b.recorrente) {
      validarDias(b.dias, ctx);
      return;
    }
    if (!b.horaInicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['horaInicio'],
        message: traduzirValidacao('validacao.obrigatorio', {
          campo: 'Hora inicial',
          genero: 'f',
        }),
      });
    }
    if (!b.horaFim) {
      ctx.addIssue({
        code: 'custom',
        path: ['horaFim'],
        message: traduzirValidacao('validacao.obrigatorio', { campo: 'Hora final', genero: 'f' }),
      });
    }
    const horasValidas = HORA.test(b.horaInicio ?? '') && HORA.test(b.horaFim ?? '');
    if (horasValidas && b.dataInicio === b.dataFim && (b.horaFim ?? '') <= (b.horaInicio ?? '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['horaFim'],
        message: traduzirValidacao('validacao.salaBloqueio.horaFimAposInicio'),
      });
    }
  })
  .transform((b) =>
    b.recorrente
      ? { ...b, horaInicio: null, horaFim: null }
      : { ...b, dias: [] as SalaBloqueioDia[] },
  );

function validarDias(dias: readonly SalaBloqueioDia[], ctx: z.RefinementCtx): void {
  if (dias.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['dias'],
      message: traduzirValidacao('validacao.salaBloqueio.diasObrigatorio'),
    });
    return;
  }
  const vistos = new Set<number>();
  dias.forEach((dia, indice) => {
    if (vistos.has(dia.diaSemana)) {
      ctx.addIssue({
        code: 'custom',
        path: ['dias', indice, 'diaSemana'],
        message: traduzirValidacao('validacao.salaBloqueio.diaDuplicado'),
      });
    }
    vistos.add(dia.diaSemana);
    if (HORA.test(dia.inicio) && HORA.test(dia.fim) && dia.fim <= dia.inicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['dias', indice, 'fim'],
        message: traduzirValidacao('validacao.salaBloqueio.horaFimAposInicio'),
      });
    }
  });
}

export type SalaBloqueioFormulario = z.input<typeof salaBloqueioInputSchema>;
export type CreateSalaBloqueioInput = z.output<typeof salaBloqueioInputSchema>;
export type UpdateSalaBloqueioInput = CreateSalaBloqueioInput;
export const createSalaBloqueioSchema = salaBloqueioInputSchema;
export const updateSalaBloqueioSchema = salaBloqueioInputSchema;

/** `POST /api/gestao-profissionais/salas-bloqueios/:id/cancelar`: o motivo é obrigatório. */
export const cancelarSalaBloqueioSchema = z.strictObject({
  motivo: textoObrigatorio('Motivo', { max: SALA_BLOQUEIO_MOTIVO_MAX }),
});
export type CancelarSalaBloqueioInput = z.infer<typeof cancelarSalaBloqueioSchema>;

// --- Resposta ----------------------------------------------------------------------------

export const salaBloqueioSchema = z.object({
  id: z.uuid(),
  salaId: z.uuid(),
  salaNome: z.string(),
  tipo: salaBloqueioTipoSchema,
  status: salaBloqueioStatusSchema,
  recorrente: z.boolean(),
  dataInicio: z.iso.date(),
  dataFim: z.iso.date(),
  horaInicio: z.string().nullable(),
  horaFim: z.string().nullable(),
  dias: z.array(salaBloqueioDiaSchema),
  profissionalId: z.uuid().nullable(),
  profissionalNome: z.string().nullable(),
  motivo: z.string().nullable(),
  /** Responsável: usuário que registrou. */
  criadoPorId: z.uuid().nullable(),
  criadoPorNome: z.string().nullable(),
  canceladoEm: z.iso.datetime({ offset: true }).nullable(),
  canceladoPorId: z.uuid().nullable(),
  canceladoPorNome: z.string().nullable(),
  motivoCancelamento: z.string().nullable(),
  /**
   * Usuário restrito (issue #153) vendo o bloqueio de outro profissional: só sala, tipo e período;
   * profissional, motivo e responsáveis vêm nulos e a tela mostra "Ocupado".
   */
  oculto: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type SalaBloqueio = z.infer<typeof salaBloqueioSchema>;

export const salaBloqueioPageSchema = paginatedResponseSchema(salaBloqueioSchema);
export type SalaBloqueioPage = z.infer<typeof salaBloqueioPageSchema>;

// --- Listagem e exportação ---------------------------------------------------------------

export const SALA_BLOQUEIO_SORT_FIELDS = ['dataInicio', 'tipo', 'createdAt'] as const;
export type SalaBloqueioSortField = (typeof SALA_BLOQUEIO_SORT_FIELDS)[number];

/** `GET /api/gestao-profissionais/salas-bloqueios`. `de`/`ate`: bloqueios que tocam o período. */
const filtrosBloqueio = {
  status: salaBloqueioStatusSchema.optional(),
  tipo: salaBloqueioTipoSchema.optional(),
  salaId: z.uuid({ error: () => traduzirValidacao('validacao.formato.uuid') }).optional(),
  de: dataSchemaOpcional('inicial'),
  ate: dataSchemaOpcional('final'),
};

const periodoCoerente = (q: { de?: string | undefined; ate?: string | undefined }) =>
  !q.de || !q.ate || q.de <= q.ate;
const PERIODO_INVALIDO = {
  error: () => traduzirValidacao('validacao.periodo.invalido'),
  path: ['ate'],
};

export const listSalaBloqueiosQuerySchema = listQuerySchema({
  sortFields: SALA_BLOQUEIO_SORT_FIELDS,
  defaultSort: 'dataInicio:desc',
  filters: filtrosBloqueio,
}).refine(periodoCoerente, PERIODO_INVALIDO);
export type ListSalaBloqueiosQuery = z.infer<typeof listSalaBloqueiosQuerySchema>;

export const SALA_BLOQUEIO_EXPORT_COLUMNS = [
  'sala',
  'tipo',
  'periodo',
  'horario',
  'profissional',
  'motivo',
  'responsavel',
  'status',
] as const;
export type SalaBloqueioExportColumn = (typeof SALA_BLOQUEIO_EXPORT_COLUMNS)[number];

export const exportSalaBloqueiosQuerySchema = exportQuerySchema(
  z.object({
    sort: listSalaBloqueiosQuerySchema.shape.sort,
    search: listSalaBloqueiosQuerySchema.shape.search,
    ...filtrosBloqueio,
  }),
  SALA_BLOQUEIO_EXPORT_COLUMNS,
).refine(periodoCoerente, PERIODO_INVALIDO);
export type ExportSalaBloqueiosQuery = z.infer<typeof exportSalaBloqueiosQuerySchema>;

// --- Ocorrências -------------------------------------------------------------------------

/** Definição mínima para calcular as ocorrências (o DTO e o registro do banco servem). */
export type DefinicaoBloqueio = Pick<
  SalaBloqueio,
  'recorrente' | 'dataInicio' | 'dataFim' | 'horaInicio' | 'horaFim' | 'dias'
>;

/** Um dia do bloqueio: `fim` pode ser "24:00" (vai até o fim do dia). */
export interface OcorrenciaBloqueio {
  data: string;
  inicio: string;
  fim: string;
}

/**
 * Dias e horários em que o bloqueio vale dentro de `[de, ate]` (`AAAA-MM-DD`). O período único
 * que atravessa dias vira um trecho por dia: do início até 24:00, dias inteiros e de 00:00 ao fim.
 */
export function ocorrenciasBloqueio(
  bloqueio: DefinicaoBloqueio,
  de: string,
  ate: string,
): OcorrenciaBloqueio[] {
  const inicio = bloqueio.dataInicio > de ? bloqueio.dataInicio : de;
  const fim = bloqueio.dataFim < ate ? bloqueio.dataFim : ate;
  const ocorrencias: OcorrenciaBloqueio[] = [];
  for (let data = inicio; data <= fim; data = adicionarDias(data, 1)) {
    if (bloqueio.recorrente) {
      const dia = bloqueio.dias.find((d) => d.diaSemana === diaDaSemana(data));
      if (dia) ocorrencias.push({ data, inicio: dia.inicio, fim: dia.fim });
      continue;
    }
    ocorrencias.push({
      data,
      inicio: data === bloqueio.dataInicio ? (bloqueio.horaInicio ?? INICIO_DO_DIA) : INICIO_DO_DIA,
      fim: data === bloqueio.dataFim ? (bloqueio.horaFim ?? FIM_DO_DIA) : FIM_DO_DIA,
    });
  }
  return ocorrencias;
}

/** Os dois bloqueios têm algum horário em comum (intervalos `[inicio, fim)`). */
export function bloqueiosSobrepostos(a: DefinicaoBloqueio, b: DefinicaoBloqueio): boolean {
  const de = a.dataInicio > b.dataInicio ? a.dataInicio : b.dataInicio;
  const ate = a.dataFim < b.dataFim ? a.dataFim : b.dataFim;
  if (de > ate) return false;
  const deB = new Map<string, OcorrenciaBloqueio[]>();
  for (const o of ocorrenciasBloqueio(b, de, ate)) {
    deB.set(o.data, [...(deB.get(o.data) ?? []), o]);
  }
  return ocorrenciasBloqueio(a, de, ate).some((o) =>
    (deB.get(o.data) ?? []).some((x) => o.inicio < x.fim && x.inicio < o.fim),
  );
}

/** Horário como na tabela: "08:00-18:00" (período único) ou "Seg 08:00-12:00, Qua 14:00-18:00". */
export function descreverHorarioBloqueio(bloqueio: DefinicaoBloqueio): string {
  if (bloqueio.recorrente) {
    return [...bloqueio.dias]
      .sort((a, b) => a.diaSemana - b.diaSemana)
      .map((d) => `${abreviarDiaSemana(d.diaSemana)} ${d.inicio}-${d.fim}`)
      .join(', ');
  }
  return `${bloqueio.horaInicio ?? ''}-${bloqueio.horaFim ?? ''}`;
}
