import { describe, expect, it } from 'vitest';
import {
  exportLotesQuerySchema,
  listLotesQuerySchema,
  loteInputSchema,
  somarDias,
  statusLote,
} from './lote';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function mensagens(resultado: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (resultado.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]),
  );
}

describe('statusLote', () => {
  const HOJE = '2026-11-17';

  it('vencido antes de hoje; vencendo de hoje até 60 dias; válido depois', () => {
    expect(statusLote('2026-11-16', HOJE)).toBe('VENCIDO');
    expect(statusLote(HOJE, HOJE)).toBe('VENCENDO');
    expect(statusLote('2027-01-16', HOJE)).toBe('VENCENDO');
    expect(statusLote('2027-01-17', HOJE)).toBe('VALIDO');
  });

  it('somarDias atravessa mês e ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('loteInputSchema', () => {
  it('exige os quatro campos do modal com a mensagem padrão', () => {
    const r = loteInputSchema.safeParse({
      produtoId: '',
      numero: '  ',
      dataVencimento: '',
      quantidade: null,
    });
    expect(mensagens(r)).toEqual({
      produtoId: 'Produto é obrigatório.',
      numero: 'Número do Lote é obrigatório.',
      dataVencimento: 'Data de Vencimento é obrigatória.',
      quantidade: 'Quantidade é obrigatória.',
    });
    expect(mensagens(loteInputSchema.safeParse({}))).toMatchObject({
      produtoId: 'Produto é obrigatório.',
      numero: 'Número do Lote é obrigatório.',
      dataVencimento: 'Data de Vencimento é obrigatória.',
    });
  });

  it('valida formato, limites e quantidade positiva', () => {
    const r = loteInputSchema.safeParse({
      produtoId: 'x',
      numero: 'L'.repeat(51),
      dataVencimento: '31/12/2026',
      quantidade: 0,
    });
    expect(mensagens(r)).toEqual({
      produtoId: 'Produto inválido',
      numero: 'Número do Lote deve ter no máximo 50 caracteres',
      dataVencimento: 'Data de Vencimento inválida',
      quantidade: 'A quantidade deve ser maior que zero',
    });
  });

  it('aceita e apara o número do lote', () => {
    const r = loteInputSchema.parse({
      produtoId: ID,
      numero: ' LOT-2026-001 ',
      dataVencimento: '2027-03-31',
      quantidade: 12.5,
    });
    expect(r).toEqual({
      produtoId: ID,
      numero: 'LOT-2026-001',
      dataVencimento: '2027-03-31',
      quantidade: 12.5,
    });
  });

  it('rejeita campos fora do formulário', () => {
    expect(
      loteInputSchema.safeParse({
        produtoId: ID,
        numero: 'L1',
        dataVencimento: '2027-03-31',
        quantidade: 1,
        status: 'VENCIDO',
      }).success,
    ).toBe(false);
  });
});

describe('listLotesQuerySchema', () => {
  it('ordena por vencimento crescente e "Apenas com saldo" desligado por padrão', () => {
    expect(listLotesQuerySchema.parse({})).toMatchObject({
      page: 1,
      sort: { field: 'vencimento', direction: 'asc' },
      comSaldo: false,
    });
  });

  it('lê os filtros e recusa valores inválidos', () => {
    expect(
      listLotesQuerySchema.parse({ produtoId: ID, comSaldo: 'true', sort: 'status:desc' }),
    ).toMatchObject({
      produtoId: ID,
      comSaldo: true,
      sort: { field: 'status', direction: 'desc' },
    });
    expect(listLotesQuerySchema.safeParse({ produtoId: 'x' }).success).toBe(false);
    expect(listLotesQuerySchema.safeParse({ comSaldo: 'sim' }).success).toBe(false);
    expect(listLotesQuerySchema.safeParse({ sort: 'createdAt:asc' }).success).toBe(false);
  });

  it('exportação aceita só as colunas do grid', () => {
    expect(
      exportLotesQuerySchema.parse({ format: 'xlsx', columns: 'produto,vencimento' }),
    ).toMatchObject({ format: 'xlsx', columns: ['produto', 'vencimento'] });
    expect(exportLotesQuerySchema.safeParse({ format: 'xlsx', columns: 'id' }).success).toBe(false);
  });
});
