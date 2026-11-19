import { describe, expect, it } from 'vitest';
import {
  createDocumentoConhecimentoSchema,
  listDocumentosConhecimentoQuerySchema,
} from './documento-conhecimento';

describe('documento de conhecimento', () => {
  it('exige título e conteúdo', () => {
    const r = createDocumentoConhecimentoSchema.safeParse({ titulo: ' ', conteudo: '' });
    expect(r.success).toBe(false);
    const msgs = r.error?.issues.map((i) => i.message);
    expect(msgs).toEqual(['Título é obrigatório.', 'Conteúdo é obrigatório.']);
  });

  it('assume Geral e sem profissional', () => {
    const r = createDocumentoConhecimentoSchema.parse({ titulo: 'FAQ', conteudo: 'Texto' });
    expect(r).toEqual({
      titulo: 'FAQ',
      conteudo: 'Texto',
      categoria: 'Geral',
      profissionalId: null,
    });
  });

  it('rejeita categoria fora da lista e campo extra', () => {
    expect(
      createDocumentoConhecimentoSchema.safeParse({ titulo: 'a', conteudo: 'b', categoria: 'X' })
        .success,
    ).toBe(false);
    expect(
      createDocumentoConhecimentoSchema.safeParse({ titulo: 'a', conteudo: 'b', extra: 1 }).success,
    ).toBe(false);
  });

  it('valida filtros da listagem', () => {
    expect(listDocumentosConhecimentoQuerySchema.safeParse({ profissionalId: 'x' }).success).toBe(
      false,
    );
    expect(listDocumentosConhecimentoQuerySchema.parse({ categoria: 'Convênio' }).categoria).toBe(
      'Convênio',
    );
  });
});
