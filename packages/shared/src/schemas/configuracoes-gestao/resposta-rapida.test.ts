import { describe, expect, it } from 'vitest';
import {
  createRespostaRapidaSchema,
  listRespostasRapidasQuerySchema,
  RESPOSTA_RAPIDA_ATALHO_INVALIDO,
} from './resposta-rapida';

function mensagens(resultado: { success: boolean; error?: { issues: { message: string }[] } }) {
  return resultado.error?.issues.map((i) => i.message);
}

describe('createRespostaRapidaSchema', () => {
  it('apara os textos, usa "Geral" como categoria padrão e atalho vazio vira null', () => {
    expect(
      createRespostaRapidaSchema.parse({
        titulo: '  Boas-vindas ',
        mensagem: ' Olá! ',
        categoria: '  ',
        atalho: '',
      }),
    ).toEqual({ titulo: 'Boas-vindas', mensagem: 'Olá!', categoria: 'Geral', atalho: null });
    expect(createRespostaRapidaSchema.parse({ titulo: 'X', mensagem: 'Y' })).toEqual({
      titulo: 'X',
      mensagem: 'Y',
      categoria: 'Geral',
      atalho: null,
    });
  });

  it('exige Título e Mensagem com a mensagem padrão de obrigatório', () => {
    expect(mensagens(createRespostaRapidaSchema.safeParse({ titulo: '', mensagem: ' ' }))).toEqual([
      'Título é obrigatório.',
      'Mensagem é obrigatória.',
    ]);
    expect(mensagens(createRespostaRapidaSchema.safeParse({}))).toEqual([
      'Título é obrigatório.',
      'Mensagem é obrigatória.',
    ]);
  });

  it('atalho começa com "/" e não tem espaços', () => {
    const base = { titulo: 'X', mensagem: 'Y' };
    for (const valido of ['/boasvindas', '/pos-consulta', '/horário_1']) {
      expect(createRespostaRapidaSchema.parse({ ...base, atalho: valido }).atalho).toBe(valido);
    }
    for (const invalido of ['boasvindas', '/', '/boas vindas', '/oi!']) {
      expect(
        mensagens(createRespostaRapidaSchema.safeParse({ ...base, atalho: invalido })),
      ).toEqual([RESPOSTA_RAPIDA_ATALHO_INVALIDO]);
    }
  });

  it('limita os tamanhos e rejeita campos desconhecidos', () => {
    const base = { titulo: 'X', mensagem: 'Y' };
    expect(createRespostaRapidaSchema.safeParse({ ...base, titulo: 'a'.repeat(121) }).success).toBe(
      false,
    );
    expect(
      createRespostaRapidaSchema.safeParse({ ...base, categoria: 'a'.repeat(61) }).success,
    ).toBe(false);
    expect(createRespostaRapidaSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe('listRespostasRapidasQuerySchema', () => {
  it('ordena por título por padrão e restringe o sort', () => {
    expect(listRespostasRapidasQuerySchema.parse({}).sort).toEqual({
      field: 'titulo',
      direction: 'asc',
    });
    expect(listRespostasRapidasQuerySchema.safeParse({ sort: 'mensagem:asc' }).success).toBe(false);
  });
});
