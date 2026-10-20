import { describe, expect, it } from 'vitest';
import {
  calcularMargem,
  createProdutoSchema,
  exportProdutosQuerySchema,
  listProdutosQuerySchema,
} from './produto';
import { createUnidadeMedidaSchema } from './unidade-medida';

const UUID = '00000000-0000-4000-8000-0000000000c1';

describe('createProdutoSchema', () => {
  it('só nome e preço de venda: aplica os padrões e normaliza vazios para null', () => {
    const saida = createProdutoSchema.parse({ nome: '  Soro ', precoVenda: 12.5, marca: '  ' });

    expect(saida).toEqual({
      nome: 'Soro',
      tipo: 'produto',
      categoriaId: null,
      unidadeMedidaId: null,
      marca: null,
      codigoBarras: null,
      sku: null,
      precoCusto: null,
      precoVenda: 12.5,
      estoqueMinimo: 0,
      controlaEstoque: true,
      ncm: null,
      descricao: null,
    });
  });

  it('aceita os 4 tipos, categoria e unidade', () => {
    for (const tipo of ['produto', 'revenda', 'uso-consumo', 'servico']) {
      const saida = createProdutoSchema.parse({
        nome: 'X',
        precoVenda: 0,
        tipo,
        categoriaId: UUID,
        unidadeMedidaId: UUID,
      });
      expect(saida).toMatchObject({ tipo, categoriaId: UUID, unidadeMedidaId: UUID });
    }
  });

  it('mensagens: nome e preço de venda obrigatórios', () => {
    const resultado = createProdutoSchema.safeParse({ nome: '   ' });

    expect(resultado.error?.issues.map((i) => [i.path[0], i.message])).toEqual([
      ['nome', 'Nome é obrigatório.'],
      ['precoVenda', 'Preço de venda é obrigatório.'],
    ]);
  });

  it('rejeita valores negativos, tipo inválido, id inválido e campos extras', () => {
    const resultado = createProdutoSchema.safeParse({
      nome: 'X',
      precoVenda: -1,
      precoCusto: -1,
      estoqueMinimo: -1,
      tipo: 'outro',
      categoriaId: 'abc',
      estoqueAtual: 3,
    });

    const issues = resultado.error?.issues ?? [];
    expect(
      issues
        .filter((i) => i.code !== 'unrecognized_keys')
        .map((i) => String(i.path[0]))
        .sort(),
    ).toEqual(['categoriaId', 'estoqueMinimo', 'precoCusto', 'precoVenda', 'tipo']);
    expect(issues.find((i) => i.code === 'unrecognized_keys')).toMatchObject({
      keys: ['estoqueAtual'],
    });
  });
});

describe('listagem e exportação', () => {
  it('padrão: nome crescente; sort fora da whitelist e tipo inválido falham', () => {
    expect(listProdutosQuerySchema.parse({}).sort).toEqual({ field: 'nome', direction: 'asc' });
    expect(listProdutosQuerySchema.parse({ sort: 'codigo:desc', tipo: 'servico' })).toMatchObject({
      sort: { field: 'codigo', direction: 'desc' },
      tipo: 'servico',
    });
    expect(listProdutosQuerySchema.safeParse({ sort: 'ncm:asc' }).success).toBe(false);
    expect(listProdutosQuerySchema.safeParse({ tipo: 'revenda' }).success).toBe(false);
  });

  it('exportação: colunas válidas e formato', () => {
    expect(
      exportProdutosQuerySchema.parse({ format: 'xlsx', columns: 'nome,codigo' }).columns,
    ).toEqual(['nome', 'codigo']);
    expect(exportProdutosQuerySchema.safeParse({ format: 'xlsx', columns: 'senha' }).success).toBe(
      false,
    );
  });
});

describe('calcularMargem', () => {
  it('(venda − custo) / venda, em %', () => {
    expect(calcularMargem(30, 50)).toBeCloseTo(40);
    expect(calcularMargem(10, 10)).toBe(0);
    expect(calcularMargem(60, 50)).toBeCloseTo(-20);
  });

  it('null sem custo ou sem preço de venda positivo', () => {
    expect(calcularMargem(null, 50)).toBeNull();
    expect(calcularMargem(10, null)).toBeNull();
    expect(calcularMargem(10, 0)).toBeNull();
  });
});

describe('createUnidadeMedidaSchema', () => {
  it('sigla em maiúsculas e nome sem espaços nas pontas', () => {
    expect(createUnidadeMedidaSchema.parse({ nome: ' Mililitro ', sigla: ' ml ' })).toEqual({
      nome: 'Mililitro',
      sigla: 'ML',
    });
  });

  it('mensagens de obrigatório e limites', () => {
    const vazio = createUnidadeMedidaSchema.safeParse({ nome: '', sigla: '' });
    expect(vazio.error?.issues.map((i) => i.message)).toEqual([
      'O nome é obrigatório.',
      'A sigla é obrigatória.',
    ]);
    expect(
      createUnidadeMedidaSchema.safeParse({ nome: 'a'.repeat(61), sigla: 'a'.repeat(11) }).success,
    ).toBe(false);
  });
});
