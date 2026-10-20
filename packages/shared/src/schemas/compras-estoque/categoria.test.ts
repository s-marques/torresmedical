import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  CATEGORIA_CORES,
  CATEGORIA_NOME_MAX,
  createCategoriaSchema,
  exportCategoriasQuerySchema,
  listCategoriasQuerySchema,
} from './categoria';

function messages(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

describe('createCategoriaSchema', () => {
  it('só o nome é obrigatório: tipo serviço, primeira cor e descrição nula por padrão', () => {
    expect(createCategoriaSchema.parse({ nome: '  Estética ' })).toEqual({
      nome: 'Estética',
      tipo: 'servico',
      cor: CATEGORIA_CORES[0],
      descricao: null,
    });
  });

  it('nome é obrigatório (ausente, vazio ou só espaços)', () => {
    for (const input of [{}, { nome: '' }, { nome: '   ' }]) {
      expect(messages(createCategoriaSchema.safeParse(input))).toEqual({
        nome: 'O nome da categoria é obrigatório.',
      });
    }
  });

  it('descrição vazia vira nula; aceita tipo e cor da paleta', () => {
    expect(
      createCategoriaSchema.parse({
        nome: 'Insumos',
        tipo: 'produto',
        cor: CATEGORIA_CORES[3],
        descricao: '  ',
      }),
    ).toMatchObject({ tipo: 'produto', cor: CATEGORIA_CORES[3], descricao: null });
  });

  it('rejeita tipo, cor fora da paleta, nome longo e campo extra', () => {
    expect(
      messages(
        createCategoriaSchema.safeParse({
          nome: 'x'.repeat(CATEGORIA_NOME_MAX + 1),
          tipo: 'outro',
          cor: '#000000',
          extra: 1,
        }),
      ),
    ).toMatchObject({ tipo: expect.any(String), cor: 'Cor inválida', nome: expect.any(String) });
  });
});

describe('listCategoriasQuerySchema', () => {
  it('padrão: nome crescente; aceita tipo e ordenação por tipo/descricao', () => {
    expect(listCategoriasQuerySchema.parse({}).sort).toEqual({ field: 'nome', direction: 'asc' });
    expect(listCategoriasQuerySchema.parse({ tipo: 'produto', sort: 'tipo:desc' })).toMatchObject({
      tipo: 'produto',
      sort: { field: 'tipo', direction: 'desc' },
    });
  });

  it('rejeita ordenação fora da whitelist e tipo inválido', () => {
    expect(listCategoriasQuerySchema.safeParse({ sort: 'cor:asc' }).success).toBe(false);
    expect(listCategoriasQuerySchema.safeParse({ tipo: 'x' }).success).toBe(false);
  });
});

describe('exportCategoriasQuerySchema', () => {
  it('aceita formato e colunas do grid', () => {
    expect(
      exportCategoriasQuerySchema.parse({ format: 'xlsx', columns: 'nome,tipo' }).columns,
    ).toEqual(['nome', 'tipo']);
  });
});
