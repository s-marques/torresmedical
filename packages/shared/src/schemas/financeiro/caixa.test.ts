import { describe, expect, it } from 'vitest';
import { abrirCaixaSchema, listCaixasQuerySchema } from './caixa';

describe('abrirCaixaSchema', () => {
  it('exige o nome', () => {
    const r = abrirCaixaSchema.safeParse({ nome: '  ', valorAbertura: 10 });
    expect(r.error?.issues[0]?.message).toBe('Nome é obrigatório.');
  });

  it('exige o valor de abertura', () => {
    const r = abrirCaixaSchema.safeParse({ nome: 'Caixa 1' });
    expect(r.error?.issues[0]?.message).toBe('Valor de abertura é obrigatório.');
  });

  it('aceita abertura zerada e rejeita negativa', () => {
    expect(abrirCaixaSchema.parse({ nome: ' Caixa 1 ', valorAbertura: 0 })).toEqual({
      nome: 'Caixa 1',
      valorAbertura: 0,
    });
    expect(abrirCaixaSchema.safeParse({ nome: 'C', valorAbertura: -1 }).success).toBe(false);
  });
});

describe('listCaixasQuerySchema', () => {
  it('ordena por abertura desc por padrão e filtra por status', () => {
    const q = listCaixasQuerySchema.parse({ status: 'aberto' });
    expect(q.sort).toEqual({ field: 'dataAbertura', direction: 'desc' });
    expect(q.status).toBe('aberto');
    expect(listCaixasQuerySchema.safeParse({ status: 'x' }).success).toBe(false);
  });
});
