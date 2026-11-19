import { describe, expect, it } from 'vitest';
import {
  exportPrescricoesQuerySchema,
  formatarNumeracaoBloco,
  formatarNumeroReceita,
  listPrescricoesQuerySchema,
  listReceituarioBlocosQuerySchema,
  prescricaoInputSchema,
  receituarioBlocoInputSchema,
} from './receituarios';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function mensagens(resultado: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (resultado.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]),
  );
}

describe('formatação da numeração', () => {
  it('número da receita com 6 dígitos e faixa do bloco', () => {
    expect(formatarNumeroReceita(7)).toBe('000007');
    expect(formatarNumeroReceita(123456)).toBe('123456');
    expect(formatarNumeracaoBloco({ numeroInicio: 1, numeroFim: 20 })).toBe('000001 - 000020');
  });
});

describe('Novo Bloco de Receituario', () => {
  it('aceita o mínimo e normaliza opcionais vazios para null', () => {
    const r = receituarioBlocoInputSchema.parse({
      tipo: 'AMARELA',
      numeroInicio: 1,
      numeroFim: 20,
      localizacao: '  ',
      profissionalId: '',
      dataRecebimento: '',
    });
    expect(r).toEqual({
      tipo: 'AMARELA',
      numeroInicio: 1,
      numeroFim: 20,
      localizacao: null,
      profissionalId: null,
      dataRecebimento: null,
    });
  });

  it('mensagens de obrigatório com o formulário vazio', () => {
    const r = receituarioBlocoInputSchema.safeParse({
      tipo: '',
      numeroInicio: null,
      numeroFim: null,
    });
    expect(mensagens(r)).toEqual({
      tipo: 'Tipo é obrigatório.',
      numeroInicio: 'Número início é obrigatório.',
      numeroFim: 'Número fim é obrigatório.',
    });
  });

  it('fim menor que o início, número zero, fracionado ou com mais de 6 dígitos', () => {
    expect(
      mensagens(
        receituarioBlocoInputSchema.safeParse({ tipo: 'AZUL', numeroInicio: 10, numeroFim: 5 }),
      ),
    ).toEqual({ numeroFim: 'Número fim deve ser maior ou igual ao início' });
    expect(
      mensagens(
        receituarioBlocoInputSchema.safeParse({
          tipo: 'AZUL',
          numeroInicio: 0,
          numeroFim: 1_000_000,
        }),
      ),
    ).toEqual({
      numeroInicio: 'Número início deve ser maior que zero',
      numeroFim: 'Número fim deve ter no máximo 6 dígitos',
    });
    expect(
      mensagens(
        receituarioBlocoInputSchema.safeParse({ tipo: 'AZUL', numeroInicio: 1.5, numeroFim: 2 }),
      ),
    ).toEqual({ numeroInicio: 'Número início deve ser um número inteiro' });
  });

  it('tipo e médico inválidos', () => {
    const r = receituarioBlocoInputSchema.safeParse({
      tipo: 'VERDE',
      numeroInicio: 1,
      numeroFim: 2,
      profissionalId: 'x',
      dataRecebimento: '2026-02-30x',
    });
    expect(mensagens(r)).toEqual({
      tipo: 'Tipo inválido',
      profissionalId: 'Médico inválido',
      dataRecebimento: 'Data de recebimento inválida',
    });
  });
});

describe('Nova Prescricao', () => {
  it('aceita o mínimo, sem posologia e sem data', () => {
    expect(
      prescricaoInputSchema.parse({ blocoId: ID, pacienteId: ID, medicacao: ' Clonazepam 2mg ' }),
    ).toEqual({
      blocoId: ID,
      pacienteId: ID,
      medicacao: 'Clonazepam 2mg',
      posologia: null,
      dataPrescricao: null,
    });
  });

  it('mensagens de obrigatório com o formulário vazio', () => {
    const r = prescricaoInputSchema.safeParse({
      blocoId: '',
      pacienteId: null,
      medicacao: '',
    });
    expect(mensagens(r)).toEqual({
      blocoId: 'Bloco é obrigatório.',
      pacienteId: 'Paciente é obrigatório.',
      medicacao: 'Medicação é obrigatória.',
    });
  });

  it('recusa campos fora do formulário (o número e o médico vêm do bloco)', () => {
    const r = prescricaoInputSchema.safeParse({
      blocoId: ID,
      pacienteId: ID,
      medicacao: 'x',
      numero: 3,
    });
    expect(r.success).toBe(false);
  });
});

describe('listagens', () => {
  it('blocos: ordenação padrão e filtros de tipo e status', () => {
    const q = listReceituarioBlocosQuerySchema.parse({ tipo: 'BRANCA', status: 'ATIVO' });
    expect(q).toMatchObject({
      sort: { field: 'createdAt', direction: 'desc' },
      tipo: 'BRANCA',
      status: 'ATIVO',
    });
    expect(listReceituarioBlocosQuerySchema.safeParse({ sort: 'numeracao:asc' }).success).toBe(
      false,
    );
  });

  it('prescrições: período De/Até coerente, inclusive na exportação', () => {
    expect(listPrescricoesQuerySchema.parse({ de: '2026-11-01', ate: '2026-11-30' })).toMatchObject(
      { de: '2026-11-01', ate: '2026-11-30', sort: { field: 'dataPrescricao' } },
    );
    expect(
      mensagens(listPrescricoesQuerySchema.safeParse({ de: '2026-11-30', ate: '2026-11-01' })),
    ).toEqual({ ate: 'A data inicial deve ser anterior ou igual à final' });
    expect(
      exportPrescricoesQuerySchema.safeParse({
        format: 'xlsx',
        de: '2026-11-30',
        ate: '2026-11-01',
      }).success,
    ).toBe(false);
    expect(
      exportPrescricoesQuerySchema.parse({ format: 'pdf', columns: 'numero,paciente' }).columns,
    ).toEqual(['numero', 'paciente']);
  });
});
