import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  atualizarPreferenciasSchema,
  PREFERENCIAS_PADRAO,
  preferenciasSchema,
} from './preferencias';

describe('preferenciasSchema', () => {
  it('os valores padrão são válidos', () => {
    expect(preferenciasSchema.parse(PREFERENCIAS_PADRAO)).toEqual(PREFERENCIAS_PADRAO);
  });
});

describe('atualizarPreferenciasSchema', () => {
  it('aceita só os campos alterados', () => {
    expect(atualizarPreferenciasSchema.parse({ resumoSemanal: true })).toEqual({
      resumoSemanal: true,
    });
    expect(atualizarPreferenciasSchema.parse({ tema: 'escuro', idioma: 'es' })).toEqual({
      tema: 'escuro',
      idioma: 'es',
    });
  });

  it('rejeita opção fora do catálogo, valor não booleano e campo desconhecido', () => {
    const resultado = atualizarPreferenciasSchema.safeParse({
      esquemaCor: 'amarelo',
      notificacoesPush: 'sim',
    });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual(
      expect.arrayContaining([
        ['esquemaCor', 'Opção inválida'],
        ['notificacoesPush', 'Valor inválido'],
      ]),
    );
    expect(atualizarPreferenciasSchema.safeParse({ idioma: 'de' }).success).toBe(false);
    expect(atualizarPreferenciasSchema.safeParse({ outro: true }).success).toBe(false);
  });

  it('exige ao menos uma preferência', () => {
    const resultado = atualizarPreferenciasSchema.safeParse({});
    expect(resultado.error?.issues[0]?.message).toBe('Informe ao menos uma preferência');
  });
});
