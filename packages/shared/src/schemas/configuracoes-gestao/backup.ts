import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { paginatedResponseSchema } from '../common/pagination';

/**
 * Registro das execuções de backup e das restaurações de teste (issue #157, R §40): uma linha por
 * execução, com resultado, tamanho e checksum. Nunca guarda dados pessoais nem a mensagem crua
 * de erro (só um código estável), porque a base tem dados de saúde.
 */
export const BACKUP_TIPOS = ['BACKUP', 'RESTAURACAO_TESTE'] as const;
export const backupTipoSchema = z.enum(BACKUP_TIPOS, { error: 'Tipo de execução inválido' });
export type BackupTipo = z.infer<typeof backupTipoSchema>;

export const BACKUP_STATUS = ['EXECUTANDO', 'SUCESSO', 'FALHA'] as const;
export const backupStatusSchema = z.enum(BACKUP_STATUS, { error: 'Status inválido' });
export type BackupStatus = z.infer<typeof backupStatusSchema>;

export const BACKUP_ORIGENS = ['AGENDADO', 'MANUAL'] as const;
export const backupOrigemSchema = z.enum(BACKUP_ORIGENS, { error: 'Origem inválida' });
export type BackupOrigem = z.infer<typeof backupOrigemSchema>;

/** Códigos estáveis de falha (também a chave da tradução no front). */
export const BACKUP_ERROS = [
  'BACKUP_DESATIVADO',
  'BACKUP_JA_EXECUTANDO',
  'BACKUP_SEM_DESTINO',
  'BACKUP_DUMP_FALHOU',
  'BACKUP_ENVIO_FALHOU',
  'BACKUP_ARQUIVOS_FALHOU',
  'RESTAURACAO_SEM_BACKUP',
  'RESTAURACAO_CHECKSUM_DIVERGENTE',
  'RESTAURACAO_FALHOU',
  'RESTAURACAO_CONTAGEM_DIVERGENTE',
  'BACKUP_ERRO_INESPERADO',
] as const;
export type BackupErro = (typeof BACKUP_ERROS)[number];

export const BACKUP_SORT_FIELDS = ['iniciadoEm', 'tipo', 'status'] as const;

export const listBackupsQuerySchema = listQuerySchema({
  sortFields: BACKUP_SORT_FIELDS,
  defaultSort: 'iniciadoEm:desc',
  filters: {
    tipo: backupTipoSchema.optional(),
    status: backupStatusSchema.optional(),
  },
});
export type ListBackupsQuery = z.infer<typeof listBackupsQuerySchema>;

export const backupExecucaoSchema = z.object({
  id: z.uuid(),
  tipo: backupTipoSchema,
  status: backupStatusSchema,
  origem: backupOrigemSchema,
  iniciadoEm: z.iso.datetime(),
  finalizadoEm: z.iso.datetime().nullable(),
  /** Tamanho do dump criptografado, em bytes. */
  tamanhoBytes: z.number().int().nonnegative().nullable(),
  /** Quantos arquivos novos do storage foram copiados para o destino. */
  arquivosCopiados: z.number().int().nonnegative(),
  checksum: z.string().nullable(),
  /** Chave do dump no destino (ou o dump que a restauração de teste usou). */
  destinoChave: z.string().nullable(),
  erroCodigo: z.string().nullable(),
  /** Resumo da conferência da restauração de teste (tabelas conferidas, divergências). */
  detalhes: z.record(z.string(), z.unknown()).nullable(),
});
export type BackupExecucao = z.infer<typeof backupExecucaoSchema>;

export const backupExecucaoPageSchema = paginatedResponseSchema(backupExecucaoSchema);
export type BackupExecucaoPage = z.infer<typeof backupExecucaoPageSchema>;

/** Política padrão de retenção dos dumps (a confirmar com o cliente). */
export const BACKUP_RETENCAO_PADRAO = { diarios: 7, semanais: 4, mensais: 6 } as const;
