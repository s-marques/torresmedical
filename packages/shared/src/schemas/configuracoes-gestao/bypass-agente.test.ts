import { describe, expect, it } from 'vitest';
import {
  BYPASS_AGENTE_TELEFONE_INVALIDO,
  createBypassAgenteSchema,
  listBypassAgenteQuerySchema,
} from './bypass-agente';

describe('bypass do agente', () => {
  it('exige o telefone', () => {
    const r = createBypassAgenteSchema.safeParse({ telefone: ' ' });
    expect(r.error?.issues.map((i) => i.message)).toEqual(['Telefone é obrigatório.']);
  });

  it('normaliza o telefone para dígitos com DDI e deixa nome e cargo vazios como null', () => {
    expect(
      createBypassAgenteSchema.parse({ telefone: '(65) 99999-0000', nome: ' ', cargo: ' Dra. ' }),
    ).toEqual({ telefone: '5565999990000', nome: null, cargo: 'Dra.' });
  });

  it('rejeita telefone curto e campos desconhecidos', () => {
    const r = createBypassAgenteSchema.safeParse({ telefone: '123', extra: 1 });
    expect(r.error?.issues.map((i) => i.message)).toContain(BYPASS_AGENTE_TELEFONE_INVALIDO);
    expect(r.success).toBe(false);
  });

  it('listagem: ordena por nome e valida sort e status', () => {
    expect(listBypassAgenteQuerySchema.parse({}).sort).toEqual({
      field: 'nome',
      direction: 'asc',
    });
    expect(listBypassAgenteQuerySchema.safeParse({ sort: 'ativo:asc' }).success).toBe(false);
    expect(listBypassAgenteQuerySchema.safeParse({ status: 'x' }).success).toBe(false);
  });
});
