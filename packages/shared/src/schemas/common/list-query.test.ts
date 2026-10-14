import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import '../../zod-pt-br';
import {
  exportColumnsSchema,
  exportQuerySchema,
  listQuerySchema,
  searchSchema,
  sortSchema,
} from './list-query';

const schema = listQuerySchema({
  sortFields: ['nome', 'createdAt'],
  defaultSort: 'nome:asc',
  filters: { status: z.enum(['ativo', 'inativo']).optional() },
});

describe('sortSchema', () => {
  const sort = sortSchema(['nome', 'createdAt'], 'nome:asc');

  it('converte campo:direção', () => {
    expect(sort.parse('createdAt:desc')).toEqual({ field: 'createdAt', direction: 'desc' });
    expect(sort.parse(' nome ')).toEqual({ field: 'nome', direction: 'asc' });
    expect(sort.parse(undefined)).toEqual({ field: 'nome', direction: 'asc' });
  });

  it.each(['senha:asc', 'nome:up', 'nome:asc:x', ''])('rejeita "%s"', (value) => {
    const result = sort.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('Ordenação inválida');
  });
});

describe('searchSchema', () => {
  it('apara e trata vazio como ausente', () => {
    expect(searchSchema.parse('  ana ')).toBe('ana');
    expect(searchSchema.parse('   ')).toBeUndefined();
    expect(searchSchema.safeParse('x'.repeat(201)).success).toBe(false);
  });
});

describe('listQuerySchema', () => {
  it('junta paginação, ordenação, busca e filtros do recurso', () => {
    expect(schema.parse({ page: '2', search: 'x', status: 'ativo' })).toEqual({
      page: 2,
      pageSize: 10,
      sort: { field: 'nome', direction: 'asc' },
      search: 'x',
      status: 'ativo',
    });
  });

  it('ignora parâmetros desconhecidos', () => {
    expect(schema.parse({ outro: '1' })).not.toHaveProperty('outro');
  });
});

describe('exportQuerySchema', () => {
  const exportSchema = exportQuerySchema(schema, ['nome', 'status', 'createdAt']);

  it('sem paginação, com formato e colunas', () => {
    const query = exportSchema.parse({
      format: 'xlsx',
      page: '3',
      status: 'inativo',
      columns: 'status, nome',
    });
    expect(query).toEqual({
      sort: { field: 'nome', direction: 'asc' },
      search: undefined,
      status: 'inativo',
      format: 'xlsx',
      columns: ['status', 'nome'],
    });
    expect(query).not.toHaveProperty('page');
  });

  it('exige formato válido', () => {
    expect(exportSchema.safeParse({}).error?.issues[0]).toMatchObject({
      path: ['format'],
      message: 'Formato deve ser xlsx ou pdf',
    });
  });
});

describe('exportColumnsSchema', () => {
  const columns = exportColumnsSchema(['a', 'b', 'c']);

  it('padrão: todas; remove repetidas e vazias', () => {
    expect(columns.parse(undefined)).toEqual(['a', 'b', 'c']);
    expect(columns.parse(' , ')).toEqual(['a', 'b', 'c']);
    expect(columns.parse('c,a,c,')).toEqual(['c', 'a']);
  });

  it('rejeita colunas fora da lista', () => {
    expect(columns.safeParse('a,x,y').error?.issues[0]?.message).toBe(
      'Colunas inválidas: x, y. Disponíveis: a, b, c',
    );
  });
});
