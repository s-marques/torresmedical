import { describe, expect, it } from 'vitest';
import { createTipoTreinamentoSchema, createTreinamentoSchema } from './treinamento';

const BASE = {
  funcionarioId: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  tipoTreinamentoId: '1c0d2a8f-2b3c-4d4e-9fa0-1b2c3d4e5f60',
};

describe('createTreinamentoSchema', () => {
  it('só Funcionário e Tipo são obrigatórios; o resto vira null', () => {
    expect(createTreinamentoSchema.parse(BASE)).toEqual({
      ...BASE,
      descricao: null,
      dataRealizacao: null,
      dataVencimento: null,
      cargaHoraria: null,
      instituicao: null,
      observacoes: null,
    });
  });

  it('vazios usam a mensagem padrão de obrigatório', () => {
    const erros = createTreinamentoSchema.safeParse({}).error?.issues.map((i) => i.message);
    expect(erros).toEqual(
      expect.arrayContaining(['Funcionário é obrigatório.', 'Tipo é obrigatório.']),
    );
  });

  it('carga horária aceita número, texto numérico e vazio', () => {
    const carga = (valor: unknown) =>
      createTreinamentoSchema.parse({ ...BASE, cargaHoraria: valor }).cargaHoraria;
    expect(carga(8)).toBe(8);
    expect(carga('16')).toBe(16);
    expect(carga('')).toBeNull();
    expect(carga(null)).toBeNull();
  });

  it('carga horária rejeita decimal, negativo e acima do limite', () => {
    for (const valor of [1.5, '2,5', -1, 10_000, 'abc']) {
      const erro = createTreinamentoSchema.safeParse({ ...BASE, cargaHoraria: valor }).error;
      expect(erro?.issues[0]?.message).toBe('Carga Horária (h) inválida');
    }
  });

  it('datas aceitam ISO ou vazio e rejeitam outros formatos', () => {
    const ok = createTreinamentoSchema.parse({
      ...BASE,
      dataRealizacao: '2026-01-10',
      dataVencimento: '',
    });
    expect(ok).toMatchObject({ dataRealizacao: '2026-01-10', dataVencimento: null });
    const erro = createTreinamentoSchema.safeParse({ ...BASE, dataVencimento: '10/01/2026' });
    expect(erro.error?.issues[0]?.message).toBe('Data Vencimento inválida');
  });

  it('textos longos são rejeitados', () => {
    const erro = createTreinamentoSchema.safeParse({ ...BASE, instituicao: 'x'.repeat(151) });
    expect(erro.error?.issues[0]?.message).toBe('Instituição deve ter no máximo 150 caracteres');
  });
});

describe('createTipoTreinamentoSchema', () => {
  it('Nome é obrigatório e vem sem espaços nas pontas', () => {
    expect(createTipoTreinamentoSchema.parse({ nome: ' NR-32 ' })).toEqual({ nome: 'NR-32' });
    expect(createTipoTreinamentoSchema.safeParse({ nome: ' ' }).error?.issues[0]?.message).toBe(
      'Nome é obrigatório.',
    );
  });
});
