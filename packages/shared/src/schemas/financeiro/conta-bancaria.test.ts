import { describe, expect, it } from 'vitest';
import { contaBancariaInputSchema, descricaoContaBancaria } from './conta-bancaria';

describe('contaBancariaInputSchema', () => {
  it('exige nome e tipo com a mensagem padrão', () => {
    const r = contaBancariaInputSchema.safeParse({});
    expect(r.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['nome', 'Nome é obrigatório.'],
      ['tipo', 'Tipo é obrigatório.'],
    ]);
  });

  it('normaliza opcionais vazios para null e saldo ausente para 0', () => {
    expect(
      contaBancariaInputSchema.parse({
        nome: ' Conta ',
        tipo: 'CAIXA',
        banco: '',
        agencia: '  ',
        dataSaldoInicial: '',
      }),
    ).toEqual({
      nome: 'Conta',
      tipo: 'CAIXA',
      banco: null,
      agencia: null,
      conta: null,
      saldoInicial: 0,
      dataSaldoInicial: null,
    });
  });

  it('aceita saldo inicial negativo e recusa data e tamanhos inválidos', () => {
    expect(
      contaBancariaInputSchema.parse({ nome: 'X', tipo: 'CORRENTE', saldoInicial: -10.5 })
        .saldoInicial,
    ).toBe(-10.5);
    const r = contaBancariaInputSchema.safeParse({
      nome: 'X',
      tipo: 'OUTRO',
      agencia: '1'.repeat(21),
      dataSaldoInicial: '2026-13-40',
    });
    expect(r.error?.issues.map((i) => i.path.join('.'))).toEqual([
      'tipo',
      'agencia',
      'dataSaldoInicial',
    ]);
  });
});

describe('descricaoContaBancaria', () => {
  it('junta banco, agência e conta como no print', () => {
    expect(descricaoContaBancaria({ banco: 'Banco', agencia: '3325', conta: '336709-6' })).toBe(
      'Banco | Ag 3325 | CC 336709-6',
    );
    expect(descricaoContaBancaria({ banco: null, agencia: null, conta: '1097776' })).toBe(
      'CC 1097776',
    );
    expect(descricaoContaBancaria({ banco: null, agencia: null, conta: null })).toBe('');
  });
});
