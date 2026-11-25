import { describe, expect, it } from 'vitest';
import {
  createExportacaoLoteSchema,
  EXPORTACAO_LOTE_COM_ARQUIVOS,
  EXPORTACAO_LOTE_ENTIDADES,
  EXPORTACAO_LOTE_ROTULOS,
  listExportacoesLoteQuerySchema,
} from './exportacao-lote';

describe('createExportacaoLoteSchema', () => {
  it('aceita a entidade e inclui os arquivos por padrão', () => {
    expect(createExportacaoLoteSchema.parse({ entidade: 'pacientes' })).toEqual({
      entidade: 'pacientes',
      incluirArquivos: true,
    });
  });

  it('rejeita entidade desconhecida ou ausente', () => {
    expect(createExportacaoLoteSchema.safeParse({ entidade: 'usuarios' }).success).toBe(false);
    expect(createExportacaoLoteSchema.safeParse({}).success).toBe(false);
  });
});

describe('catálogo', () => {
  it('toda entidade tem rótulo e as com arquivos fazem parte do catálogo', () => {
    for (const entidade of EXPORTACAO_LOTE_ENTIDADES) {
      expect(EXPORTACAO_LOTE_ROTULOS[entidade]).toBeTruthy();
    }
    for (const entidade of EXPORTACAO_LOTE_COM_ARQUIVOS) {
      expect(EXPORTACAO_LOTE_ENTIDADES).toContain(entidade);
    }
  });
});

describe('listExportacoesLoteQuerySchema', () => {
  it('usa a ordenação padrão e valida os filtros', () => {
    const query = listExportacoesLoteQuerySchema.parse({ status: 'CONCLUIDA' });
    expect(query.status).toBe('CONCLUIDA');
    expect(query.sort).toEqual({ field: 'solicitadaEm', direction: 'desc' });
    expect(listExportacoesLoteQuerySchema.safeParse({ status: 'x' }).success).toBe(false);
  });
});
