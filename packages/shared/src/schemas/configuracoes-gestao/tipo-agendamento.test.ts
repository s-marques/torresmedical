import { describe, expect, it } from 'vitest';
import {
  createTipoAgendamentoSchema,
  listTiposAgendamentoQuerySchema,
  updateTipoAgendamentoSchema,
} from './tipo-agendamento';

function mensagens(resultado: { success: boolean; error?: { issues: { message: string }[] } }) {
  return resultado.error?.issues.map((i) => i.message);
}

describe('createTipoAgendamentoSchema', () => {
  it('aplica os padrões do modal "Novo Tipo" e apara o nome', () => {
    expect(createTipoAgendamentoSchema.parse({ nome: '  Consulta  ' })).toEqual({
      nome: 'Consulta',
      duracaoMinutos: 30,
      cor: '#3b82f6',
      permiteProcedimento: false,
      permitePacote: false,
      soroterapia: false,
    });
  });

  it('exige o nome com a mensagem do sistema atual', () => {
    expect(mensagens(createTipoAgendamentoSchema.safeParse({ nome: '' }))).toEqual([
      'Nome é obrigatório.',
    ]);
    expect(mensagens(createTipoAgendamentoSchema.safeParse({}))).toEqual(['Nome é obrigatório.']);
  });

  it('valida duração (inteiro de 1 a 1440) e cor (#RRGGBB)', () => {
    const base = { nome: 'X' };
    expect(createTipoAgendamentoSchema.safeParse({ ...base, duracaoMinutos: 0 }).success).toBe(
      false,
    );
    expect(createTipoAgendamentoSchema.safeParse({ ...base, duracaoMinutos: 1441 }).success).toBe(
      false,
    );
    expect(createTipoAgendamentoSchema.safeParse({ ...base, duracaoMinutos: 1.5 }).success).toBe(
      false,
    );
    expect(createTipoAgendamentoSchema.safeParse({ ...base, cor: 'azul' }).success).toBe(false);
    expect(createTipoAgendamentoSchema.safeParse({ ...base, cor: '#AABBCC' }).success).toBe(true);
  });

  it('rejeita campos desconhecidos', () => {
    expect(createTipoAgendamentoSchema.safeParse({ nome: 'X', ativo: false }).success).toBe(false);
  });
});

describe('updateTipoAgendamentoSchema', () => {
  it('exige ao menos um campo e aceita alteração parcial', () => {
    expect(mensagens(updateTipoAgendamentoSchema.safeParse({}))).toEqual([
      'Informe ao menos um campo para alterar',
    ]);
    expect(updateTipoAgendamentoSchema.parse({ soroterapia: true })).toEqual({ soroterapia: true });
  });
});

describe('listTiposAgendamentoQuerySchema', () => {
  it('ordena por nome por padrão e restringe o sort', () => {
    expect(listTiposAgendamentoQuerySchema.parse({}).sort).toEqual({
      field: 'nome',
      direction: 'asc',
    });
    expect(listTiposAgendamentoQuerySchema.safeParse({ sort: 'deletedAt:asc' }).success).toBe(
      false,
    );
  });
});
