import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { mensagemObrigatoria } from '../common/obrigatorio';
import { paginatedResponseSchema } from '../common/pagination';
import { DIAS_SEMANA } from './profissional-agenda';

export const CONTRATO_ESPECIALIDADE_MAX = 200;
export const CONTRATO_OBSERVACOES_MAX = 2000;
export const CONTRATO_VALOR_MAX = 9_999_999.99;
export const CONTRATO_QUANTIDADE_MAX = 9999;
export const CONTRATO_DIA_VENCIMENTO_PADRAO = 10;
/** Horário sugerido ao marcar um dia da semana (o dev pode alterar). */
export const CONTRATO_HORARIO_PADRAO = { inicio: '08:00', fim: '18:00' } as const;

export const CONTRATO_MODALIDADES = ['MENSAL', 'TURNO', 'HORA'] as const;
export const contratoModalidadeSchema = z.enum(CONTRATO_MODALIDADES, {
  error: 'Modalidade inválida',
});
export type ContratoModalidade = z.infer<typeof contratoModalidadeSchema>;

export const CONTRATO_MODALIDADE_ROTULOS: Record<ContratoModalidade, string> = {
  MENSAL: 'Mensal (Fixo)',
  TURNO: 'Por Turno',
  HORA: 'Hora Avulsa',
};

export const CONTRATO_MODALIDADE_DESCRICOES: Record<ContratoModalidade, string> = {
  MENSAL: 'Valor fixo mensal',
  TURNO: 'Cobra por turno utilizado',
  HORA: 'Cobra por hora registrada',
};

/** Rótulos de `valorUnitario` e `quantidadeMensal` em cada modalidade. */
export const CONTRATO_MODALIDADE_CAMPOS: Record<
  ContratoModalidade,
  { valor: string; quantidade: string | null; unidade: string; unidadeQuantidade: string | null }
> = {
  MENSAL: { valor: 'Valor Mensal (R$)', quantidade: null, unidade: 'mês', unidadeQuantidade: null },
  TURNO: {
    valor: 'Valor por Turno (R$)',
    quantidade: 'Turnos Contratados/mês',
    unidade: 'turno',
    unidadeQuantidade: 'turno(s)',
  },
  HORA: {
    valor: 'Valor por Hora (R$)',
    quantidade: 'Horas Contratadas/mês',
    unidade: 'hora',
    unidadeQuantidade: 'h',
  },
};

export const CONTRATO_LOCATARIO_TIPOS = ['PROFISSIONAL', 'CLIENTE'] as const;
export const contratoLocatarioTipoSchema = z.enum(CONTRATO_LOCATARIO_TIPOS, {
  error: 'Tipo de locatário inválido',
});
export type ContratoLocatarioTipo = z.infer<typeof contratoLocatarioTipoSchema>;

export const CONTRATO_LOCATARIO_ROTULOS: Record<ContratoLocatarioTipo, string> = {
  PROFISSIONAL: 'Profissional',
  CLIENTE: 'Cliente',
};

export const CONTRATO_TIPOS_RECEITA = ['FIXO', 'VARIAVEL', 'MISTO'] as const;
export const contratoTipoReceitaSchema = z.enum(CONTRATO_TIPOS_RECEITA, {
  error: 'Tipo de receita inválido',
});
export type ContratoTipoReceita = z.infer<typeof contratoTipoReceitaSchema>;

export const CONTRATO_TIPO_RECEITA_ROTULOS: Record<ContratoTipoReceita, string> = {
  FIXO: 'Fixo',
  VARIAVEL: 'Variável',
  MISTO: 'Misto',
};

export const CONTRATO_INDICES_REAJUSTE = [
  'NENHUM',
  'IGPM',
  'IPCA',
  'INPC',
  'LIVRE_NEGOCIACAO',
] as const;
export const contratoIndiceReajusteSchema = z.enum(CONTRATO_INDICES_REAJUSTE, {
  error: 'Índice de reajuste inválido',
});
export type ContratoIndiceReajuste = z.infer<typeof contratoIndiceReajusteSchema>;

export const CONTRATO_INDICE_REAJUSTE_ROTULOS: Record<ContratoIndiceReajuste, string> = {
  NENHUM: 'Nenhum',
  IGPM: 'IGP-M',
  IPCA: 'IPCA',
  INPC: 'INPC',
  LIVRE_NEGOCIACAO: 'Livre negociação',
};

export const CONTRATO_STATUS = ['ATIVO', 'CANCELADO', 'ENCERRADO'] as const;
export const contratoStatusSchema = z.enum(CONTRATO_STATUS, { error: 'Status inválido' });
export type ContratoStatus = z.infer<typeof contratoStatusSchema>;

export const CONTRATO_STATUS_ROTULOS: Record<ContratoStatus, string> = {
  ATIVO: 'ativo',
  CANCELADO: 'cancelado',
  ENCERRADO: 'encerrado',
};

/** Abreviação do dia da semana (`DIAS_SEMANA`, 0 = domingo): "Dom", "Seg", "Ter"… */
export function abreviarDiaSemana(diaSemana: number): string {
  return (DIAS_SEMANA[diaSemana] ?? '').slice(0, 3);
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const horaSchema = (rotulo: string) =>
  z
    .string({ error: mensagemObrigatoria(rotulo, 'f') })
    .regex(HORA, { error: `${rotulo} inválida` });

export const contratoDiaSchema = z.strictObject({
  diaSemana: z
    .number({ error: 'Dia da semana inválido' })
    .int({ error: 'Dia da semana inválido' })
    .min(0, { error: 'Dia da semana inválido' })
    .max(6, { error: 'Dia da semana inválido' }),
  inicio: horaSchema('Hora inicial'),
  fim: horaSchema('Hora final'),
});
export type ContratoDia = z.infer<typeof contratoDiaSchema>;

const dataSchema = (rotulo: string, genero: 'm' | 'f') =>
  z
    .string({ error: mensagemObrigatoria(rotulo, genero) })
    .min(1, { error: mensagemObrigatoria(rotulo, genero) })
    .pipe(z.iso.date({ error: `${rotulo} inválida` }));

const valorSchema = z
  .number({ error: 'Informe o valor' })
  .min(0, { error: 'O valor não pode ser negativo' })
  .max(CONTRATO_VALOR_MAX, { error: 'Valor inválido' });

const uuidObrigatorio = (rotulo: string, genero: 'm' | 'f' = 'm') =>
  z
    .string({ error: mensagemObrigatoria(rotulo, genero) })
    .min(1, { error: mensagemObrigatoria(rotulo, genero) })
    .pipe(z.uuid({ error: `${rotulo} inválid${genero === 'f' ? 'a' : 'o'}` }));

/**
 * Corpo de `POST` e `PATCH /api/gestao-profissionais/contratos-sala` (modais "Novo Contrato" e
 * "Editar Contrato"). O `PATCH` substitui os campos do formulário. `valorUnitario` é o valor
 * mensal (Mensal), por turno (Por Turno) ou por hora (Hora Avulsa); `quantidadeMensal` são os
 * turnos ou horas contratados por mês (só nessas duas modalidades).
 */
export const contratoSalaInputSchema = z
  .strictObject({
    modalidade: contratoModalidadeSchema.default('MENSAL'),
    salaId: uuidObrigatorio('Sala', 'f'),
    locatarioTipo: contratoLocatarioTipoSchema.default('PROFISSIONAL'),
    locatarioId: uuidObrigatorio('Locatário'),
    especialidade: z
      .string({ error: 'Especialidade inválida' })
      .trim()
      .max(CONTRATO_ESPECIALIDADE_MAX, {
        error: `Especialidade deve ter no máximo ${CONTRATO_ESPECIALIDADE_MAX} caracteres`,
      })
      .nullish()
      .transform((valor) => valor || null),
    valorUnitario: valorSchema,
    quantidadeMensal: z
      .number({ error: 'Informe a quantidade' })
      .positive({ error: 'A quantidade deve ser maior que zero' })
      .max(CONTRATO_QUANTIDADE_MAX, { error: 'Quantidade inválida' })
      .nullish()
      .transform((valor) => valor ?? null),
    permuta: z.boolean({ error: 'Valor inválido' }).default(false),
    tipoReceita: contratoTipoReceitaSchema.default('FIXO'),
    diaVencimento: z
      .number({ error: 'Informe o dia de vencimento' })
      .int({ error: 'O dia de vencimento deve ser um número inteiro' })
      .min(1, { error: 'O dia de vencimento deve ser de 1 a 31' })
      .max(31, { error: 'O dia de vencimento deve ser de 1 a 31' })
      .default(CONTRATO_DIA_VENCIMENTO_PADRAO),
    formaPagamentoId: z
      .uuid({ error: 'Forma de pagamento inválida' })
      .nullish()
      .transform((valor) => valor ?? null),
    indiceReajuste: contratoIndiceReajusteSchema.default('NENHUM'),
    dataInicio: dataSchema('Data de início', 'f'),
    dataFim: z
      .string({ error: 'Data de fim inválida' })
      .nullish()
      .transform((valor) => valor || null)
      .pipe(z.iso.date({ error: 'Data de fim inválida' }).nullable()),
    dias: z.array(contratoDiaSchema).max(7).default([]),
    permiteIndicacao: z.boolean({ error: 'Valor inválido' }).default(true),
    participaEventos: z.boolean({ error: 'Valor inválido' }).default(false),
    observacoes: z
      .string({ error: 'Observações inválidas' })
      .trim()
      .max(CONTRATO_OBSERVACOES_MAX, {
        error: `Observações devem ter no máximo ${CONTRATO_OBSERVACOES_MAX} caracteres`,
      })
      .nullish()
      .transform((valor) => valor || null),
  })
  .superRefine((contrato, ctx) => {
    if (contrato.modalidade !== 'MENSAL' && contrato.quantidadeMensal === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantidadeMensal'],
        message: mensagemObrigatoria(
          contrato.modalidade === 'TURNO' ? 'Turnos contratados' : 'Horas contratadas',
        ),
      });
    }
    if (contrato.modalidade === 'TURNO' && !Number.isInteger(contrato.quantidadeMensal ?? 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantidadeMensal'],
        message: 'Os turnos contratados devem ser um número inteiro',
      });
    }
    if (contrato.dataFim && contrato.dataFim < contrato.dataInicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataFim'],
        message: 'A data de fim não pode ser anterior à data de início',
      });
    }
    const vistos = new Set<number>();
    contrato.dias.forEach((dia, i) => {
      if (vistos.has(dia.diaSemana)) {
        ctx.addIssue({
          code: 'custom',
          path: ['dias', i, 'diaSemana'],
          message: 'Dia da semana repetido',
        });
      }
      vistos.add(dia.diaSemana);
      if (dia.fim <= dia.inicio) {
        ctx.addIssue({
          code: 'custom',
          path: ['dias', i, 'fim'],
          message: 'A hora final deve ser depois da hora inicial',
        });
      }
    });
  });

export type ContratoSalaFormulario = z.input<typeof contratoSalaInputSchema>;
export type CreateContratoSalaInput = z.output<typeof contratoSalaInputSchema>;
export type UpdateContratoSalaInput = CreateContratoSalaInput;
export const createContratoSalaSchema = contratoSalaInputSchema;
export const updateContratoSalaSchema = contratoSalaInputSchema;

/** `PUT /api/gestao-profissionais/contratos-sala/:id/pdf`; `arquivoId: null` remove o PDF. */
export const contratoSalaPdfInputSchema = z.strictObject({
  arquivoId: z.uuid({ error: 'Arquivo inválido' }).nullable(),
});
export type ContratoSalaPdfInput = z.infer<typeof contratoSalaPdfInputSchema>;

export const CONTRATO_SORT_FIELDS = ['status', 'dataInicio', 'dataFim', 'valorUnitario'] as const;

/** `GET /api/gestao-profissionais/contratos-sala`. */
export const listContratosSalaQuerySchema = listQuerySchema({
  sortFields: CONTRATO_SORT_FIELDS,
  defaultSort: 'status:asc',
  filters: {
    status: contratoStatusSchema.optional(),
    salaId: z.uuid({ error: 'Sala inválida' }).optional(),
  },
});
export type ListContratosSalaQuery = z.infer<typeof listContratosSalaQuerySchema>;

export const CONTRATO_EXPORT_COLUMNS = [
  'sala',
  'locatario',
  'modalidade',
  'dias',
  'valor',
  'vigencia',
  'status',
] as const;
export type ContratoExportColumn = (typeof CONTRATO_EXPORT_COLUMNS)[number];

/** `GET /api/gestao-profissionais/contratos-sala/export`. */
export const exportContratosSalaQuerySchema = exportQuerySchema(
  listContratosSalaQuerySchema,
  CONTRATO_EXPORT_COLUMNS,
);
export type ExportContratosSalaQuery = z.infer<typeof exportContratosSalaQuerySchema>;

export const contratoSalaSchema = z.object({
  id: z.uuid(),
  modalidade: contratoModalidadeSchema,
  salaId: z.uuid(),
  salaNome: z.string(),
  salaNumero: z.string().nullable(),
  locatarioTipo: contratoLocatarioTipoSchema,
  locatarioId: z.uuid(),
  locatarioNome: z.string(),
  especialidade: z.string().nullable(),
  valorUnitario: z.number(),
  quantidadeMensal: z.number().nullable(),
  /** Mensal: o valor; Por Turno e Hora Avulsa: valor × quantidade contratada. */
  valorTotalMensal: z.number(),
  permuta: z.boolean(),
  tipoReceita: contratoTipoReceitaSchema,
  diaVencimento: z.number().int(),
  formaPagamentoId: z.uuid().nullable(),
  formaPagamentoNome: z.string().nullable(),
  indiceReajuste: contratoIndiceReajusteSchema,
  dataInicio: z.iso.date(),
  dataFim: z.iso.date().nullable(),
  dias: z.array(contratoDiaSchema),
  permiteIndicacao: z.boolean(),
  participaEventos: z.boolean(),
  observacoes: z.string().nullable(),
  status: contratoStatusSchema,
  pdfArquivoId: z.uuid().nullable(),
  pdfNome: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ContratoSala = z.infer<typeof contratoSalaSchema>;

export const contratoSalaPageSchema = paginatedResponseSchema(contratoSalaSchema);
export type ContratoSalaPage = z.infer<typeof contratoSalaPageSchema>;

/** Total mensal: o valor (Mensal) ou valor × quantidade (Por Turno e Hora Avulsa). */
export function valorTotalMensal(
  modalidade: ContratoModalidade,
  valorUnitario: number,
  quantidadeMensal: number | null,
): number {
  if (modalidade === 'MENSAL') return valorUnitario;
  return Math.round(valorUnitario * (quantidadeMensal ?? 0) * 100) / 100;
}

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valor do contrato como na tabela: "R$ 870,00/turno", "R$ 6.750,00/mês", "R$ 87,50/hora". */
export function descreverValorContrato(
  contrato: Pick<ContratoSala, 'modalidade' | 'valorUnitario'>,
): string {
  const unidade = CONTRATO_MODALIDADE_CAMPOS[contrato.modalidade].unidade;
  return `${MOEDA.format(contrato.valorUnitario)}/${unidade}`;
}

/** Dias e horários como na tabela: "Ter 14:00-18:00". */
export function descreverDiaContrato(dia: ContratoDia): string {
  return `${abreviarDiaSemana(dia.diaSemana)} ${dia.inicio}-${dia.fim}`;
}
