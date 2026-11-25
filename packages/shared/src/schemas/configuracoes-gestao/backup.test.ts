import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  BACKUP_ERROS,
  BACKUP_RETENCAO_PADRAO,
  backupExecucaoPageSchema,
  listBackupsQuerySchema,
} from './backup';

describe('listBackupsQuerySchema', () => {
  it('usa a execução mais recente primeiro e a paginação padrão', () => {
    const query = listBackupsQuerySchema.parse({});
    expect(query.sort).toEqual({ field: 'iniciadoEm', direction: 'desc' });
    expect(query.page).toBe(1);
  });

  it('aceita filtros de tipo e status', () => {
    const query = listBackupsQuerySchema.parse({ tipo: 'BACKUP', status: 'FALHA' });
    expect(query).toMatchObject({ tipo: 'BACKUP', status: 'FALHA' });
  });

  it('recusa tipo, status e ordenação desconhecidos', () => {
    expect(listBackupsQuerySchema.safeParse({ tipo: 'OUTRO' }).success).toBe(false);
    expect(listBackupsQuerySchema.safeParse({ status: 'X' }).success).toBe(false);
    expect(listBackupsQuerySchema.safeParse({ sort: 'erroCodigo:asc' }).success).toBe(false);
  });
});

describe('backupExecucaoPageSchema', () => {
  it('valida uma página com execução concluída e outra em andamento', () => {
    const base = {
      tipo: 'BACKUP',
      origem: 'AGENDADO',
      iniciadoEm: '2026-11-25T05:00:00.000Z',
      arquivosCopiados: 0,
      checksum: null,
      destinoChave: null,
      erroCodigo: null,
      detalhes: null,
      tamanhoBytes: null,
    };
    const page = {
      data: [
        {
          ...base,
          id: '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f',
          status: 'EXECUTANDO',
          finalizadoEm: null,
        },
        {
          ...base,
          id: '8b2e4d63-9e1a-4c9f-8a5d-3c3a4d5e6f70',
          status: 'SUCESSO',
          finalizadoEm: '2026-11-25T05:03:00.000Z',
          tamanhoBytes: 1024,
        },
      ],
      meta: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    };
    expect(backupExecucaoPageSchema.safeParse(page).success).toBe(true);
  });
});

describe('constantes', () => {
  it('lista códigos de erro únicos e a retenção padrão', () => {
    expect(new Set(BACKUP_ERROS).size).toBe(BACKUP_ERROS.length);
    expect(BACKUP_RETENCAO_PADRAO).toEqual({ diarios: 7, semanais: 4, mensais: 6 });
  });
});
