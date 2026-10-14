import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PAGE_SIZE_MAX, paginatedResponseSchema, paginationQuerySchema } from './pagination';

describe('paginationQuerySchema', () => {
  it('aplica os padrões page=1 e pageSize=10', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 });
  });

  it('converte números vindos da query string', () => {
    expect(paginationQuerySchema.parse({ page: '2', pageSize: '50' })).toEqual({
      page: 2,
      pageSize: 50,
    });
  });

  it.each([
    [{ page: '0' }, 'Página deve ser maior ou igual a 1'],
    [{ page: 'abc' }, 'Página inválida'],
    [{ page: '1.5' }, 'Página inválida'],
    [{ pageSize: String(PAGE_SIZE_MAX + 1) }, 'Tamanho da página deve ser no máximo 100'],
    [{ pageSize: '0' }, 'Tamanho da página deve ser maior ou igual a 1'],
  ])('rejeita %o com mensagem em português', (query, mensagem) => {
    const result = paginationQuerySchema.safeParse(query);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(mensagem);
  });
});

describe('paginatedResponseSchema', () => {
  it('valida { data, meta }', () => {
    const schema = paginatedResponseSchema(z.object({ id: z.string() }));
    const page = { data: [{ id: 'a' }], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } };

    expect(schema.parse(page)).toEqual(page);
    expect(schema.safeParse({ data: [] }).success).toBe(false);
  });
});
