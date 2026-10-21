import { describe, expect, it } from 'vitest';
import { createSalaSchema, listSalasQuerySchema } from './sala';

describe('salaInputSchema', () => {
  it('aplica o tipo padrão (Consultório) e normaliza vazios para null', () => {
    expect(
      createSalaSchema.parse({ nome: '  Sala 1 ', numero: '', andar: '  ', equipamentos: '' }),
    ).toEqual({
      nome: 'Sala 1',
      numero: null,
      andar: null,
      tipo: 'CONSULTORIO',
      metragem: null,
      valorHora: null,
      valorTurno: null,
      valorMensal: null,
      equipamentos: null,
    });
  });

  it('aceita os valores numéricos e o tipo Reunião', () => {
    expect(
      createSalaSchema.parse({
        nome: 'Sala 9',
        tipo: 'REUNIAO',
        metragem: 12.5,
        valorHora: 50,
        valorTurno: 200,
        valorMensal: 3000,
      }),
    ).toMatchObject({ tipo: 'REUNIAO', metragem: 12.5, valorHora: 50, valorMensal: 3000 });
  });

  it('exige o nome com a mensagem padrão', () => {
    const vazio = createSalaSchema.safeParse({ nome: '   ' });
    expect(vazio.success).toBe(false);
    expect(vazio.error?.issues[0]?.message).toBe('Nome é obrigatório.');
    const ausente = createSalaSchema.safeParse({});
    expect(ausente.error?.issues[0]?.message).toBe('Nome é obrigatório.');
  });

  it('rejeita tipo desconhecido, valor negativo e campo fora do formulário', () => {
    const resultado = createSalaSchema.safeParse({
      nome: 'Sala',
      tipo: 'OUTRO',
      valorHora: -1,
      ativo: false,
    });
    expect(resultado.success).toBe(false);
    const mensagens = resultado.error?.issues.map((i) => i.message) ?? [];
    expect(mensagens).toContain('Tipo inválido');
    expect(mensagens).toContain('Valor por hora não pode ser negativo');
  });

  it('limita o tamanho do nome', () => {
    const resultado = createSalaSchema.safeParse({ nome: 'x'.repeat(101) });
    expect(resultado.error?.issues[0]?.message).toBe('Nome deve ter no máximo 100 caracteres');
  });
});

describe('listSalasQuerySchema', () => {
  it('usa nome:asc por padrão e aceita os filtros', () => {
    const query = listSalasQuerySchema.parse({ status: 'ativo', tipo: 'REUNIAO' });
    expect(query.sort).toEqual({ field: 'nome', direction: 'asc' });
    expect(query).toMatchObject({ status: 'ativo', tipo: 'REUNIAO' });
  });

  it('rejeita sort fora da whitelist', () => {
    expect(listSalasQuerySchema.safeParse({ sort: 'ativo:asc' }).success).toBe(false);
  });
});
