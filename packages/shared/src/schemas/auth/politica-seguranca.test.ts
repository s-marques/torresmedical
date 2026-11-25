import { describe, expect, it } from 'vitest';
import {
  POLITICA_PADRAO,
  politicaSegurancaInputSchema,
  trocarSenhaFormSchema,
  trocarSenhaSchema,
  validarSenhaPolitica,
} from './politica-seguranca';

const REGRAS = { tamanhoMinimo: 8, exigirMaiuscula: false, exigirSimbolo: false };

describe('validarSenhaPolitica', () => {
  it('aceita a senha que cumpre a política padrão', () => {
    expect(validarSenhaPolitica('abcdefg1', REGRAS)).toEqual([]);
  });

  it('aponta o tamanho mínimo configurado', () => {
    expect(validarSenhaPolitica('abc12', { ...REGRAS, tamanhoMinimo: 12 })).toEqual([
      'A senha deve ter no mínimo 12 caracteres',
    ]);
  });

  it('exige maiúscula e símbolo quando ligados, com uma mensagem para cada', () => {
    const erros = validarSenhaPolitica('abcdefgh1', {
      ...REGRAS,
      exigirMaiuscula: true,
      exigirSimbolo: true,
    });

    expect(erros).toEqual([
      'A senha deve ter ao menos uma letra maiúscula',
      'A senha deve ter ao menos um símbolo (ex.: ! @ # $ %)',
    ]);
  });

  it('aceita maiúscula acentuada e símbolo unicode', () => {
    const regras = { ...REGRAS, exigirMaiuscula: true, exigirSimbolo: true };

    expect(validarSenhaPolitica('Ábcdefg1!', regras)).toEqual([]);
    expect(validarSenhaPolitica('Abcdefg1€', regras)).toEqual([]);
  });

  it('recusa senha acima do máximo', () => {
    expect(validarSenhaPolitica('a1'.repeat(70), REGRAS)).toEqual([
      'A senha deve ter no máximo 128 caracteres',
    ]);
  });
});

describe('politicaSegurancaInputSchema', () => {
  it('aceita o padrão', () => {
    expect(politicaSegurancaInputSchema.parse(POLITICA_PADRAO)).toEqual(POLITICA_PADRAO);
  });

  it.each([
    { tamanhoMinimo: 7 },
    { tamanhoMinimo: 65 },
    { tentativasBloqueio: 2 },
    { minutosBloqueio: 0 },
    { expiracaoDias: 10 },
    { carenciaProfissionalDias: -1 },
    { tamanhoMinimo: 8.5 },
  ])('recusa %j', (parcial) => {
    expect(politicaSegurancaInputSchema.safeParse({ ...POLITICA_PADRAO, ...parcial }).success).toBe(
      false,
    );
  });

  it('expiração nula significa que a senha não expira', () => {
    expect(
      politicaSegurancaInputSchema.parse({ ...POLITICA_PADRAO, expiracaoDias: null }).expiracaoDias,
    ).toBeNull();
  });

  it('não aceita campos extras', () => {
    expect(politicaSegurancaInputSchema.safeParse({ ...POLITICA_PADRAO, x: 1 }).success).toBe(
      false,
    );
  });
});

describe('trocarSenhaSchema', () => {
  it('recusa a senha nova igual à atual', () => {
    const r = trocarSenhaSchema.safeParse({ senhaAtual: 'senha1234', senhaNova: 'senha1234' });

    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('A senha nova deve ser diferente da atual');
  });

  it('aplica as regras fixas da senha nova (letras e números)', () => {
    const r = trocarSenhaSchema.safeParse({ senhaAtual: 'x', senhaNova: 'somenteletras' });

    expect(r.error?.issues[0]?.message).toBe('A senha deve ter letras e números');
  });

  it('formulário: a confirmação precisa conferir', () => {
    const r = trocarSenhaFormSchema.safeParse({
      senhaAtual: 'a',
      senhaNova: 'abc12345',
      confirmacao: 'abc12346',
    });

    expect(r.error?.issues[0]?.message).toBe('As senhas não conferem');
  });
});
