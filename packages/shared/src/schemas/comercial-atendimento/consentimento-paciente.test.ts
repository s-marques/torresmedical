import { describe, expect, it } from 'vitest';
import {
  CONSENTIMENTO_OBSERVACAO_MAX,
  consentimentoSchema,
  consentimentosResponseSchema,
  createConsentimentoSchema,
} from './consentimento-paciente';

const VALIDO = { tipo: 'CAMPANHAS', aceito: false, canal: 'WHATSAPP' };

describe('createConsentimentoSchema', () => {
  it('aceita tipo, aceito/recusado e canal; observação vazia vira null', () => {
    expect(createConsentimentoSchema.parse(VALIDO)).toEqual({ ...VALIDO, observacao: null });
    expect(createConsentimentoSchema.parse({ ...VALIDO, observacao: '' }).observacao).toBeNull();
    expect(
      createConsentimentoSchema.parse({ ...VALIDO, observacao: '  Pediu para parar ' }).observacao,
    ).toBe('Pediu para parar');
  });

  it('tipo, aceito e canal são obrigatórios, com a mensagem padrão', () => {
    const erros = createConsentimentoSchema.safeParse({}).error?.issues;

    expect(erros?.map((e) => [e.path[0], e.message])).toEqual([
      ['tipo', 'Tipo é obrigatório.'],
      ['aceito', 'Consentimento é obrigatório.'],
      ['canal', 'Canal é obrigatório.'],
    ]);
  });

  it('recusa tipo e canal fora da lista, aceito que não é booleano e campos extras', () => {
    for (const dados of [
      { ...VALIDO, tipo: 'OUTRO' },
      { ...VALIDO, canal: 'POMBO' },
      { ...VALIDO, aceito: 'sim' },
      { ...VALIDO, extra: 1 },
      { ...VALIDO, observacao: 'x'.repeat(CONSENTIMENTO_OBSERVACAO_MAX + 1) },
    ]) {
      expect(createConsentimentoSchema.safeParse(dados).success).toBe(false);
    }
  });

  it('os três tipos são aceitos', () => {
    for (const tipo of ['TRATAMENTO_DADOS', 'COMUNICACAO', 'CAMPANHAS']) {
      expect(createConsentimentoSchema.safeParse({ ...VALIDO, tipo }).success).toBe(true);
    }
  });
});

describe('consentimentoSchema', () => {
  const REGISTRO = {
    id: '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    pacienteId: '2b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    ...VALIDO,
    versao: '1',
    observacao: null,
    registradoPorId: null,
    registradoPorNome: null,
    registradoEm: '2026-11-24T12:00:00.000Z',
  };

  it('aceita o registro da API, com autor opcional', () => {
    expect(consentimentoSchema.safeParse(REGISTRO).success).toBe(true);
    expect(
      consentimentosResponseSchema.safeParse({
        data: [{ ...REGISTRO, registradoPorId: 'u1', registradoPorNome: 'Ana' }],
      }).success,
    ).toBe(true);
  });

  it('recusa id que não é uuid e data inválida', () => {
    expect(consentimentoSchema.safeParse({ ...REGISTRO, id: 'c1' }).success).toBe(false);
    expect(consentimentoSchema.safeParse({ ...REGISTRO, registradoEm: 'ontem' }).success).toBe(
      false,
    );
  });
});
