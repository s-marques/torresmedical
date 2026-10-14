import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import './zod-pt-br';

function messages(schema: z.ZodType, value: unknown): Record<string, string> {
  const result = schema.safeParse(value);
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

describe('mensagens padrão em pt-BR', () => {
  const schema = z.strictObject({
    nome: z.string().min(2).max(5),
    idade: z.number().int().min(0).lt(150).multipleOf(1),
    email: z.email(),
    id: z.uuid(),
    site: z.url(),
    data: z.iso.date(),
    tipo: z.enum(['a', 'b']),
    tags: z.array(z.string()).min(1).max(2),
    nota: z.number().gt(0),
    quantidade: z.number().max(10),
    passo: z.number().multipleOf(5),
    codigo: z.string().regex(/^\d+$/),
  });

  it('obrigatórios', () => {
    expect(messages(schema, {})).toMatchObject({
      nome: 'Campo obrigatório',
      idade: 'Campo obrigatório',
      tipo: 'Campo obrigatório',
    });
  });

  it('tamanho, formato, opção e campo não permitido', () => {
    expect(
      messages(schema, {
        nome: 'a',
        idade: -1,
        email: 'x',
        id: '1',
        site: 'nada',
        data: '2026-13-01',
        tipo: 'c',
        tags: [],
        nota: 0,
        quantidade: 11,
        passo: 3,
        codigo: 'abc',
        extra: 1,
      }),
    ).toEqual({
      nome: 'Deve ter no mínimo 2 caracteres',
      idade: 'Deve ser maior ou igual a 0',
      email: 'E-mail inválido',
      id: 'Identificador inválido',
      site: 'URL inválida',
      data: 'Data inválida',
      tipo: 'Opção inválida',
      tags: 'Deve ter no mínimo 1 item',
      nota: 'Deve ser maior que 0',
      quantidade: 'Deve ser menor ou igual a 10',
      passo: 'Deve ser múltiplo de 5',
      codigo: 'Formato inválido',
      _: 'Campo não permitido: extra',
    });
  });

  it('máximos e tipo errado', () => {
    expect(
      messages(schema.pick({ nome: true, tags: true, idade: true }), {
        nome: 'abcdef',
        tags: ['a', 'b', 'c'],
        idade: 200,
      }),
    ).toEqual({
      nome: 'Deve ter no máximo 5 caracteres',
      tags: 'Deve ter no máximo 2 itens',
      idade: 'Deve ser menor que 150',
    });
    expect(messages(z.object({ n: z.number() }), { n: 'x' })).toEqual({ n: 'Valor inválido' });
    expect(messages(z.string().min(1), '')).toEqual({ _: 'Deve ter no mínimo 1 caractere' });
  });

  it('outros códigos caem em "Valor inválido"; mensagens do schema têm precedência', () => {
    expect(messages(z.union([z.string(), z.number()]), true)).toEqual({ _: 'Valor inválido' });
    expect(messages(z.string().min(3, { error: 'Muito curto' }), 'a')).toEqual({
      _: 'Muito curto',
    });
  });
});
