import { describe, expect, it } from 'vitest';
import {
  anamneseInputSchema,
  atendimentoInputSchema,
  listPacientesComRegistrosQuerySchema,
  prontuarioInputSchema,
} from './prontuario';

describe('prontuarioInputSchema', () => {
  it('normaliza vazios para null e aceita todos os campos opcionais', () => {
    expect(prontuarioInputSchema.parse({})).toEqual({
      alergias: null,
      medicamentosEmUso: null,
      doencasCronicas: null,
      cirurgiasAnteriores: null,
      historicoFamiliar: null,
      observacoes: null,
    });
    expect(
      prontuarioInputSchema.parse({ alergias: '  Dipirona  ', observacoes: '' }),
    ).toMatchObject({ alergias: 'Dipirona', observacoes: null });
  });

  it('rejeita campo fora do formulário', () => {
    expect(prontuarioInputSchema.safeParse({ extra: 1 }).success).toBe(false);
  });
});

describe('atendimentoInputSchema', () => {
  it('exige profissionalId e aplica o status padrão "Em andamento"', () => {
    const resultado = atendimentoInputSchema.parse({
      profissionalId: '11111111-1111-4111-8111-111111111111',
    });
    expect(resultado).toMatchObject({ status: 'EM_ANDAMENTO', tipo: null });
  });

  it('rejeita sem profissional e tipo inválido', () => {
    const semProfissional = atendimentoInputSchema.safeParse({});
    expect(semProfissional.success).toBe(false);
    const tipoInvalido = atendimentoInputSchema.safeParse({
      profissionalId: '11111111-1111-4111-8111-111111111111',
      tipo: 'INEXISTENTE',
    });
    expect(tipoInvalido.success).toBe(false);
  });

  it('aceita o tipo e o status escolhidos', () => {
    const resultado = atendimentoInputSchema.parse({
      profissionalId: '11111111-1111-4111-8111-111111111111',
      tipo: 'RETORNO',
      status: 'FINALIZADO',
      queixa: 'Dor de cabeça',
    });
    expect(resultado).toMatchObject({
      tipo: 'RETORNO',
      status: 'FINALIZADO',
      queixa: 'Dor de cabeça',
    });
  });
});

describe('anamneseInputSchema', () => {
  it('profissional é opcional', () => {
    expect(anamneseInputSchema.parse({})).toMatchObject({ profissionalId: null });
  });
});

describe('listPacientesComRegistrosQuerySchema', () => {
  it('usa ultimoRegistro:desc por padrão', () => {
    const query = listPacientesComRegistrosQuerySchema.parse({});
    expect(query.sort).toEqual({ field: 'ultimoRegistro', direction: 'desc' });
  });

  it('rejeita sort fora da whitelist', () => {
    expect(listPacientesComRegistrosQuerySchema.safeParse({ sort: 'documento:asc' }).success).toBe(
      false,
    );
  });
});
