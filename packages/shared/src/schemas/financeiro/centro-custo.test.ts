import { describe, expect, it } from 'vitest';
import {
  CENTRO_CUSTO_NOME_MAX,
  createCentroCustoSchema,
  listCentrosCustoQuerySchema,
  updateCentroCustoSchema,
} from './centro-custo';

describe('createCentroCustoSchema', () => {
  it('apara o nome', () => {
    expect(createCentroCustoSchema.parse({ nome: '  Administrativo ' })).toEqual({
      nome: 'Administrativo',
    });
  });

  it('exige o nome', () => {
    expect(createCentroCustoSchema.safeParse({}).error?.issues[0]?.message).toBe(
      'Nome é obrigatório.',
    );
    expect(createCentroCustoSchema.safeParse({ nome: '   ' }).error?.issues[0]?.message).toBe(
      'Nome é obrigatório.',
    );
  });

  it('limita o tamanho e rejeita campos extras', () => {
    const longo = 'a'.repeat(CENTRO_CUSTO_NOME_MAX + 1);
    expect(createCentroCustoSchema.safeParse({ nome: longo }).error?.issues[0]?.message).toBe(
      'Nome deve ter no máximo 100 caracteres',
    );
    expect(createCentroCustoSchema.safeParse({ nome: 'X', ativo: true }).success).toBe(false);
  });
});

describe('updateCentroCustoSchema', () => {
  it('aceita só o nome ou só o interruptor ativo', () => {
    expect(updateCentroCustoSchema.parse({ nome: ' Clínico ' })).toEqual({ nome: 'Clínico' });
    expect(updateCentroCustoSchema.parse({ ativo: false })).toEqual({ ativo: false });
  });

  it('exige ao menos um campo e rejeita tipos errados', () => {
    expect(updateCentroCustoSchema.safeParse({}).error?.issues[0]?.message).toBe(
      'Informe ao menos um campo para alterar',
    );
    expect(updateCentroCustoSchema.safeParse({ ativo: 'sim' }).success).toBe(false);
    expect(updateCentroCustoSchema.safeParse({ nome: '' }).success).toBe(false);
  });
});

describe('listCentrosCustoQuerySchema', () => {
  it('ordena pelo nome por padrão e rejeita ordenação fora da lista', () => {
    expect(listCentrosCustoQuerySchema.parse({}).sort).toEqual({ field: 'nome', direction: 'asc' });
    expect(listCentrosCustoQuerySchema.parse({ sort: 'createdAt:desc' }).sort).toEqual({
      field: 'createdAt',
      direction: 'desc',
    });
    expect(listCentrosCustoQuerySchema.safeParse({ sort: 'x:asc' }).success).toBe(false);
  });
});
