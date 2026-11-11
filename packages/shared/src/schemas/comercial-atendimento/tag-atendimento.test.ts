import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  createTagAtendimentoSchema,
  listTagsAtendimentoQuerySchema,
  TAG_ATENDIMENTO_COR_PADRAO,
  TAG_ATENDIMENTO_NOME_MAX,
} from './tag-atendimento';

function messages(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

describe('createTagAtendimentoSchema', () => {
  it('apara o nome e usa a cor padrão', () => {
    expect(createTagAtendimentoSchema.parse({ nome: '  VIP ' })).toEqual({
      nome: 'VIP',
      cor: TAG_ATENDIMENTO_COR_PADRAO,
    });
  });

  it('"Nome da tag é obrigatório." quando ausente, vazio ou só espaços', () => {
    for (const input of [{}, { nome: '' }, { nome: '   ' }]) {
      expect(messages(createTagAtendimentoSchema.safeParse(input))).toEqual({
        nome: 'Nome da tag é obrigatório.',
      });
    }
  });

  it('limita o nome e valida a cor #RRGGBB', () => {
    expect(
      messages(
        createTagAtendimentoSchema.safeParse({
          nome: 'x'.repeat(TAG_ATENDIMENTO_NOME_MAX + 1),
          cor: 'azul',
        }),
      ),
    ).toEqual({
      nome: `Nome da tag deve ter no máximo ${TAG_ATENDIMENTO_NOME_MAX} caracteres`,
      cor: 'Cor inválida. Use o formato #RRGGBB',
    });
    expect(createTagAtendimentoSchema.parse({ nome: 'A', cor: '#22C55E' }).cor).toBe('#22C55E');
  });
});

describe('listTagsAtendimentoQuerySchema', () => {
  it('ordena por nome', () => {
    expect(listTagsAtendimentoQuerySchema.parse({}).sort).toEqual({
      field: 'nome',
      direction: 'asc',
    });
  });
});
