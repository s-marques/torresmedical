import { z } from 'zod';
import { exportQuerySchema, listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';
import { dataSchemaOpcional, PERIODO_CONSULTA_INVALIDO } from './periodo-vendas';

/** Chips da aba Consultas Realizadas: Todos (ausente) / Pago / Pendente. */
export const CONSULTA_PAGAMENTO_FILTRO = ['pago', 'pendente'] as const;
export const consultaPagamentoFiltroSchema = z.enum(CONSULTA_PAGAMENTO_FILTRO, {
  error: 'Pagamento inválido',
});
export type ConsultaPagamentoFiltro = z.infer<typeof consultaPagamentoFiltroSchema>;

/** Texto da coluna Pagamento quando a consulta ainda não foi recebida. */
export const CONSULTA_SEM_COBRANCA = 'Sem cobrança';

export const CONSULTA_SORT_FIELDS = [
  'data',
  'paciente',
  'profissional',
  'tipo',
  'valor',
  'pagamento',
] as const;

const filtros = {
  /** Período De/Até (`AAAA-MM-DD`, dia do calendário da clínica), ambos opcionais. */
  de: dataSchemaOpcional('inicial'),
  ate: dataSchemaOpcional('final'),
  pagamento: consultaPagamentoFiltroSchema.optional(),
};

const periodoCoerente = <T extends { de?: string | undefined; ate?: string | undefined }>(
  consulta: T,
) => !consulta.de || !consulta.ate || consulta.de <= consulta.ate;

/**
 * `GET /api/comercial-atendimento/vendas/consultas`: consultas realizadas (agendamentos com status
 * Atendido) no período.
 */
export const listConsultasRealizadasQuerySchema = listQuerySchema({
  sortFields: CONSULTA_SORT_FIELDS,
  defaultSort: 'data:desc',
  filters: filtros,
}).refine(periodoCoerente, { error: PERIODO_CONSULTA_INVALIDO, path: ['ate'] });
export type ListConsultasRealizadasQuery = z.infer<typeof listConsultasRealizadasQuerySchema>;

/** `GET .../vendas/consultas/totais`: os três cards, com o mesmo período e filtro da listagem. */
export const totaisConsultasRealizadasQuerySchema = z
  .object(filtros)
  .refine(periodoCoerente, { error: PERIODO_CONSULTA_INVALIDO, path: ['ate'] });
export type TotaisConsultasRealizadasQuery = z.infer<typeof totaisConsultasRealizadasQuerySchema>;

export const CONSULTA_EXPORT_COLUMNS = CONSULTA_SORT_FIELDS;
export type ConsultaExportColumn = (typeof CONSULTA_EXPORT_COLUMNS)[number];

/** `GET .../vendas/consultas/export`. */
export const exportConsultasRealizadasQuerySchema = exportQuerySchema(
  z.object({
    sort: listConsultasRealizadasQuerySchema.shape.sort,
    search: listConsultasRealizadasQuerySchema.shape.search,
    ...filtros,
  }),
  CONSULTA_EXPORT_COLUMNS,
);
export type ExportConsultasRealizadasQuery = z.infer<typeof exportConsultasRealizadasQuerySchema>;

/** Valores monetários chegam como texto decimal (ex.: `"295.00"`), exatos como no banco. */
const decimal = z.string();

export const consultaRealizadaSchema = z.object({
  id: z.uuid(),
  /** Coluna "Data": início do atendimento (data e hora). */
  data: z.iso.datetime(),
  pacienteId: z.uuid(),
  /** Coluna "Paciente" (nome). */
  paciente: z.string(),
  /** Telefone exibido abaixo do nome. */
  pacienteTelefone: z.string().nullable(),
  /** Coluna "Profissional". */
  profissional: z.string(),
  /** Coluna "Tipo": nome do tipo de agendamento (Consulta, Procedimento…). */
  tipo: z.string().nullable(),
  valor: decimal,
  pago: z.boolean(),
  /** Forma de pagamento quando `pago` ("Voucher" em "Pago (Voucher)"). */
  formaPagamento: z.string().nullable(),
});
export type ConsultaRealizada = z.infer<typeof consultaRealizadaSchema>;

export const consultaRealizadaPageSchema = paginatedResponseSchema(consultaRealizadaSchema);
export type ConsultaRealizadaPage = z.infer<typeof consultaRealizadaPageSchema>;

export const totaisConsultasRealizadasSchema = z.object({
  /** Card "Total Consultas". */
  totalConsultas: z.number().int(),
  /** Card "Valor Total". */
  valorTotal: decimal,
  /** Card "Recebido": soma das consultas já pagas. */
  recebido: decimal,
});
export type TotaisConsultasRealizadas = z.infer<typeof totaisConsultasRealizadasSchema>;
