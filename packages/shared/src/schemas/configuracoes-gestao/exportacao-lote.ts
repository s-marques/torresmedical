import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';

/**
 * Exportação em lote por entidade (issue #158, R §39): ZIP com CSV e arquivos, gerado em fila e
 * baixável por tempo limitado. Evita a dependência de fornecedor: a clínica leva todos os dados.
 */
export const EXPORTACAO_LOTE_ENTIDADES = [
  'pacientes',
  'profissionais',
  'agendamentos',
  'prontuarios',
  'contas-receber',
  'contas-pagar',
  'contratos-sala',
] as const;
export const exportacaoLoteEntidadeSchema = z.enum(EXPORTACAO_LOTE_ENTIDADES, {
  error: 'Entidade inválida',
});
export type ExportacaoLoteEntidade = z.infer<typeof exportacaoLoteEntidadeSchema>;

export const EXPORTACAO_LOTE_ROTULOS: Readonly<Record<ExportacaoLoteEntidade, string>> = {
  pacientes: 'Pacientes',
  profissionais: 'Profissionais',
  agendamentos: 'Agendas (agendamentos)',
  prontuarios: 'Prontuários (com anexos)',
  'contas-receber': 'Financeiro: contas a receber',
  'contas-pagar': 'Financeiro: contas a pagar',
  'contratos-sala': 'Contratos de sala (com PDFs)',
};

/** Entidades que levam arquivos no ZIP (anexos, PDFs de contrato) além dos CSVs. */
export const EXPORTACAO_LOTE_COM_ARQUIVOS: readonly ExportacaoLoteEntidade[] = [
  'prontuarios',
  'contratos-sala',
];

export const EXPORTACAO_LOTE_STATUS = ['PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'FALHOU'] as const;
export const exportacaoLoteStatusSchema = z.enum(EXPORTACAO_LOTE_STATUS, {
  error: 'Status inválido',
});
export type ExportacaoLoteStatus = z.infer<typeof exportacaoLoteStatusSchema>;

/** Códigos estáveis de falha (chave da tradução no front). Nunca a mensagem crua do erro. */
export const EXPORTACAO_LOTE_ERROS = [
  'ARQUIVOS_ACIMA_DO_LIMITE',
  'ENTIDADE_INDISPONIVEL',
  'ERRO_PROCESSAMENTO',
] as const;
export type ExportacaoLoteErro = (typeof EXPORTACAO_LOTE_ERROS)[number];

/** Por quanto tempo o ZIP pronto fica disponível para download. */
export const EXPORTACAO_LOTE_VALIDADE_HORAS = 24;

export const createExportacaoLoteSchema = z.object({
  entidade: exportacaoLoteEntidadeSchema,
  /** Inclui os arquivos da entidade (anexos, PDFs). Sem efeito nas que não têm arquivos. */
  incluirArquivos: z.boolean().default(true),
});
export type CreateExportacaoLoteInput = z.input<typeof createExportacaoLoteSchema>;
export type CreateExportacaoLote = z.output<typeof createExportacaoLoteSchema>;

export const EXPORTACAO_LOTE_SORT_FIELDS = ['solicitadaEm', 'entidade', 'status'] as const;

export const listExportacoesLoteQuerySchema = listQuerySchema({
  sortFields: EXPORTACAO_LOTE_SORT_FIELDS,
  defaultSort: 'solicitadaEm:desc',
  filters: {
    entidade: exportacaoLoteEntidadeSchema.optional(),
    status: exportacaoLoteStatusSchema.optional(),
  },
});
export type ListExportacoesLoteQuery = z.infer<typeof listExportacoesLoteQuerySchema>;

export const exportacaoLoteSchema = z.object({
  id: z.uuid(),
  entidade: exportacaoLoteEntidadeSchema,
  incluirArquivos: z.boolean(),
  status: exportacaoLoteStatusSchema,
  solicitadoPorId: z.string().nullable(),
  solicitadaEm: z.iso.datetime(),
  concluidaEm: z.iso.datetime().nullable(),
  /** Fim da validade do download; depois dele o arquivo não é mais entregue. */
  expiraEm: z.iso.datetime().nullable(),
  /** Tamanho do ZIP, em bytes. */
  tamanhoBytes: z.number().int().nonnegative().nullable(),
  erroCodigo: z.string().nullable(),
  /** Concluída e dentro da validade: o download está liberado. */
  disponivel: z.boolean(),
});
export type ExportacaoLote = z.infer<typeof exportacaoLoteSchema>;

export const exportacaoLotePageSchema = paginatedResponseSchema(exportacaoLoteSchema);
export type ExportacaoLotePage = z.infer<typeof exportacaoLotePageSchema>;

export const exportacaoLoteEntidadeInfoSchema = z.object({
  id: exportacaoLoteEntidadeSchema,
  rotulo: z.string(),
  comArquivos: z.boolean(),
});
export type ExportacaoLoteEntidadeInfo = z.infer<typeof exportacaoLoteEntidadeInfoSchema>;
