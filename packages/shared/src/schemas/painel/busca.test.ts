import { describe, expect, it } from 'vitest';
import { buscaGlobalQuerySchema } from './busca';

describe('buscaGlobalQuerySchema', () => {
  it('aceita termo com 2 ou mais caracteres e apara os espaços', () => {
    expect(buscaGlobalQuerySchema.parse({ q: '  Ana ' }).q).toBe('Ana');
  });

  it('aceita número de um dígito (nº de contrato), mas não letra solta', () => {
    expect(buscaGlobalQuerySchema.safeParse({ q: '7' }).success).toBe(true);
    const r = buscaGlobalQuerySchema.safeParse({ q: 'a' });
    expect(r.success).toBe(false);
  });

  it('exige o termo e limita o tamanho', () => {
    expect(buscaGlobalQuerySchema.safeParse({}).success).toBe(false);
    expect(buscaGlobalQuerySchema.safeParse({ q: '   ' }).success).toBe(false);
    expect(buscaGlobalQuerySchema.safeParse({ q: 'x'.repeat(81) }).success).toBe(false);
  });

  it('rejeita parâmetros desconhecidos', () => {
    expect(buscaGlobalQuerySchema.safeParse({ q: 'Ana', limite: 100 }).success).toBe(false);
  });
});
