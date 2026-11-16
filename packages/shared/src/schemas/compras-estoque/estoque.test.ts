import { describe, expect, it } from 'vitest';
import {
  abaixoDoMinimo,
  ajusteEstoqueSchema,
  calcularSugestao,
  entradaEstoqueSchema,
  exportSugestaoQuerySchema,
  listMovimentacoesQuerySchema,
  listPosicaoQuerySchema,
  saidaEstoqueSchema,
  statusEstoque,
} from './estoque';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function mensagens(resultado: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (resultado.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]),
  );
}

describe('entradaEstoqueSchema', () => {
  it('exige produto, quantidade e motivo com a mensagem padrão', () => {
    const r = entradaEstoqueSchema.safeParse({ produtoId: '', quantidade: null });
    expect(mensagens(r)).toMatchObject({
      produtoId: 'Produto é obrigatório.',
      quantidade: 'Quantidade é obrigatória.',
      motivo: 'Motivo é obrigatório.',
    });
  });

  it('rejeita quantidade zero, custo negativo e validade inválida', () => {
    const r = entradaEstoqueSchema.safeParse({
      produtoId: ID,
      quantidade: 0,
      motivo: 'COMPRA',
      custoUnitario: -1,
      validade: '2026-13-40',
    });
    expect(mensagens(r)).toMatchObject({
      quantidade: 'A quantidade deve ser maior que zero',
      custoUnitario: 'O custo unitário não pode ser negativo',
      validade: 'Validade inválida',
    });
  });

  it('normaliza opcionais vazios para null', () => {
    expect(
      entradaEstoqueSchema.parse({
        produtoId: ID,
        quantidade: 2,
        motivo: 'DOACAO',
        lote: ' ',
        validade: '',
        documento: '',
      }),
    ).toEqual({
      produtoId: ID,
      quantidade: 2,
      motivo: 'DOACAO',
      custoUnitario: null,
      lote: null,
      validade: null,
      documento: null,
      fornecedorId: null,
    });
  });

  it('não aceita motivo de saída', () => {
    expect(
      entradaEstoqueSchema.safeParse({ produtoId: ID, quantidade: 1, motivo: 'USO_INTERNO' })
        .success,
    ).toBe(false);
  });
});

describe('saidaEstoqueSchema', () => {
  it('exige produto, quantidade e motivo', () => {
    expect(mensagens(saidaEstoqueSchema.safeParse({}))).toMatchObject({
      produtoId: 'Produto é obrigatório.',
      quantidade: 'Quantidade é obrigatória.',
      motivo: 'Motivo é obrigatório.',
    });
  });

  it('aceita uma saída válida', () => {
    expect(
      saidaEstoqueSchema.parse({ produtoId: ID, quantidade: 1.5, motivo: 'USO_INTERNO' }),
    ).toMatchObject({ documento: null });
  });
});

describe('ajusteEstoqueSchema', () => {
  it('exige produto, quantidade real e motivo', () => {
    expect(
      mensagens(
        ajusteEstoqueSchema.safeParse({ produtoId: '', quantidadeReal: null, motivo: ' ' }),
      ),
    ).toMatchObject({
      produtoId: 'Produto é obrigatório.',
      quantidadeReal: 'Quantidade real é obrigatória.',
      motivo: 'Motivo é obrigatório.',
    });
  });

  it('aceita zero e rejeita negativo', () => {
    expect(
      ajusteEstoqueSchema.safeParse({ produtoId: ID, quantidadeReal: 0, motivo: 'Inventário' })
        .success,
    ).toBe(true);
    expect(
      ajusteEstoqueSchema.safeParse({ produtoId: ID, quantidadeReal: -1, motivo: 'x' }).success,
    ).toBe(false);
  });
});

describe('consultas', () => {
  it('posição: ordena por produto e aceita só OK/BAIXO/ZERADO', () => {
    expect(listPosicaoQuerySchema.parse({}).sort).toEqual({ field: 'produto', direction: 'asc' });
    expect(listPosicaoQuerySchema.safeParse({ status: 'SEM_CONTROLE' }).success).toBe(false);
    expect(listPosicaoQuerySchema.safeParse({ categoriaId: 'x' }).success).toBe(false);
  });

  it('movimentações: período vazio é ignorado e data inválida é rejeitada', () => {
    expect(listMovimentacoesQuerySchema.parse({ de: '', ate: '' })).toMatchObject({
      de: undefined,
      ate: undefined,
      sort: { field: 'data', direction: 'desc' },
    });
    expect(listMovimentacoesQuerySchema.safeParse({ de: '31/12/2026' }).success).toBe(false);
  });

  it('exportação da sugestão exige formato', () => {
    expect(exportSugestaoQuerySchema.safeParse({}).success).toBe(false);
    expect(exportSugestaoQuerySchema.parse({ format: 'xlsx' }).columns).toContain('produto');
  });
});

describe('statusEstoque e abaixoDoMinimo', () => {
  it.each([
    [{ controlaEstoque: false, estoqueAtual: 5, estoqueMinimo: 0 }, 'SEM_CONTROLE'],
    [{ controlaEstoque: true, estoqueAtual: 0, estoqueMinimo: 0 }, 'ZERADO'],
    [{ controlaEstoque: true, estoqueAtual: -1, estoqueMinimo: 2 }, 'ZERADO'],
    [{ controlaEstoque: true, estoqueAtual: 2, estoqueMinimo: 2 }, 'BAIXO'],
    [{ controlaEstoque: true, estoqueAtual: 3, estoqueMinimo: 2 }, 'OK'],
    [{ controlaEstoque: true, estoqueAtual: 1, estoqueMinimo: 0 }, 'OK'],
  ] as const)('%o → %s', (saldo, status) => {
    expect(statusEstoque(saldo)).toBe(status);
  });

  it('abaixo do mínimo exige mínimo definido e produto controlado', () => {
    expect(abaixoDoMinimo({ controlaEstoque: true, estoqueAtual: 0, estoqueMinimo: 1 })).toBe(true);
    expect(abaixoDoMinimo({ controlaEstoque: true, estoqueAtual: 0, estoqueMinimo: 0 })).toBe(
      false,
    );
    expect(abaixoDoMinimo({ controlaEstoque: false, estoqueAtual: 0, estoqueMinimo: 1 })).toBe(
      false,
    );
  });
});

describe('calcularSugestao', () => {
  it('sem consumo: sugere só o que falta para o mínimo e não prevê dias', () => {
    expect(calcularSugestao(2, 5, 0)).toEqual({
      consumoDiario: 0,
      diasParaAcabar: null,
      qtdSugerida: 3,
      prioridade: 'URGENTE',
    });
  });

  it('com consumo: cobre o mínimo mais 30 dias', () => {
    // 90 saídas em 90 dias = 1/dia; 10 + 30 - 20 = 20.
    expect(calcularSugestao(20, 10, 90)).toEqual({
      consumoDiario: 1,
      diasParaAcabar: 20,
      qtdSugerida: 20,
      prioridade: 'NORMAL',
    });
  });

  it('crítico quando zerado ou acaba em menos de 7 dias', () => {
    expect(calcularSugestao(0, 0, 0).prioridade).toBe('CRITICO');
    expect(calcularSugestao(6, 0, 90).prioridade).toBe('CRITICO');
  });

  it('urgente quando acaba em menos de 15 dias', () => {
    expect(calcularSugestao(14, 0, 90).prioridade).toBe('URGENTE');
  });

  it('nunca sugere quantidade negativa e arredonda para cima', () => {
    expect(calcularSugestao(100, 5, 0).qtdSugerida).toBe(0);
    expect(calcularSugestao(0, 0, 10).qtdSugerida).toBe(4); // 30 × 0,111… = 3,33
  });
});
