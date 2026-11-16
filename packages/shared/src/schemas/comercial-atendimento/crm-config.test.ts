import { describe, expect, it } from 'vitest';
import { estagioInputSchema, motivoPerdaInputSchema, pipelineInputSchema } from './crm-config';

const erros = (resultado: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((resultado.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]));

describe('pipelineInputSchema e motivoPerdaInputSchema', () => {
  it('exigem o nome, sem espaços nas pontas', () => {
    expect(erros(pipelineInputSchema.safeParse({ nome: ' ' }))).toEqual({
      nome: 'Nome é obrigatório.',
    });
    expect(erros(motivoPerdaInputSchema.safeParse({}))).toEqual({ nome: 'Nome é obrigatório.' });
    expect(pipelineInputSchema.parse({ nome: '  Vendas  ' })).toEqual({ nome: 'Vendas' });
  });
});

describe('estagioInputSchema', () => {
  it('exige nome e cor; marco vazio vira null; cor em minúsculas', () => {
    expect(erros(estagioInputSchema.safeParse({}))).toEqual({
      nome: 'Nome é obrigatório.',
      cor: 'Cor é obrigatória.',
    });
    expect(estagioInputSchema.parse({ nome: 'Visita', cor: '#AABBCC' })).toEqual({
      nome: 'Visita',
      cor: '#aabbcc',
      marco: null,
    });
  });

  it('aceita os marcos do dashboard e rejeita cor e marco inválidos', () => {
    expect(
      estagioInputSchema.parse({ nome: 'Contrato', cor: '#22c55e', marco: 'CONTRATO' }).marco,
    ).toBe('CONTRATO');
    expect(erros(estagioInputSchema.safeParse({ nome: 'X', cor: 'azul', marco: 'OUTRO' }))).toEqual(
      { cor: 'Cor inválida. Use o formato #RRGGBB', marco: 'Marco inválido' },
    );
  });
});
