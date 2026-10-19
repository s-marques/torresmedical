import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  alterarAtivaOrigemClienteSchema,
  createOrigemClienteSchema,
  exportOrigensClienteQuerySchema,
  gerarCodigoOrigemCliente,
  listOrigensClienteQuerySchema,
  moverOrigemClienteSchema,
  ORIGEM_CLIENTE_NOME_MAX,
  updateOrigemClienteSchema,
} from './origem-cliente';

function messages(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

describe('createOrigemClienteSchema', () => {
  it('apara o nome', () => {
    expect(createOrigemClienteSchema.parse({ nome: '  Facebook Ads ' })).toEqual({
      nome: 'Facebook Ads',
    });
  });

  it('nome é obrigatório (ausente, vazio ou só espaços)', () => {
    for (const input of [{}, { nome: '' }, { nome: '   ' }]) {
      expect(messages(createOrigemClienteSchema.safeParse(input))).toEqual({
        nome: 'Nome é obrigatório.',
      });
    }
  });

  it('limite do nome e campo não permitido', () => {
    expect(
      messages(
        createOrigemClienteSchema.safeParse({
          nome: 'x'.repeat(ORIGEM_CLIENTE_NOME_MAX + 1),
          codigo: 'a',
        }),
      ),
    ).toEqual({
      nome: 'O nome deve ter no máximo 120 caracteres',
      _: 'Campo não permitido: codigo',
    });
  });
});

describe('updateOrigemClienteSchema', () => {
  it('exige o nome e não aceita outros campos', () => {
    expect(updateOrigemClienteSchema.parse({ nome: ' Google ' })).toEqual({ nome: 'Google' });
    expect(messages(updateOrigemClienteSchema.safeParse({}))).toEqual({
      nome: 'Nome é obrigatório.',
    });
    expect(updateOrigemClienteSchema.safeParse({ nome: 'X', ativa: true }).success).toBe(false);
  });
});

describe('ativa e mover', () => {
  it('ativa exige booleano', () => {
    expect(alterarAtivaOrigemClienteSchema.parse({ ativa: false })).toEqual({ ativa: false });
    expect(alterarAtivaOrigemClienteSchema.safeParse({}).success).toBe(false);
    expect(alterarAtivaOrigemClienteSchema.safeParse({ ativa: 'sim' }).success).toBe(false);
  });

  it('mover aceita cima ou baixo', () => {
    expect(moverOrigemClienteSchema.parse({ direcao: 'cima' })).toEqual({ direcao: 'cima' });
    expect(messages(moverOrigemClienteSchema.safeParse({ direcao: 'lado' }))).toEqual({
      direcao: 'Direção inválida. Use cima ou baixo',
    });
  });
});

describe('listagem e exportação', () => {
  it('ordena por ordem e aceita status', () => {
    expect(listOrigensClienteQuerySchema.parse({ status: 'ativo' })).toMatchObject({
      sort: { field: 'ordem', direction: 'asc' },
      status: 'ativo',
    });
    expect(listOrigensClienteQuerySchema.safeParse({ sort: 'createdAt:asc' }).success).toBe(false);
  });

  it('exportação aceita as colunas da grid', () => {
    expect(
      exportOrigensClienteQuerySchema.parse({ format: 'xlsx', columns: 'nome,codigo' }),
    ).toMatchObject({ format: 'xlsx', columns: ['nome', 'codigo'] });
    expect(
      exportOrigensClienteQuerySchema.safeParse({ format: 'xlsx', columns: 'cpf' }).success,
    ).toBe(false);
  });
});

describe('gerarCodigoOrigemCliente', () => {
  it.each([
    ['Indicação', 'indicacao'],
    ['Google', 'google'],
    ['Evento Wellness 26/09/2026', 'evento_wellness_26_09_2026'],
    ['  Facebook   Ads! ', 'facebook_ads'],
    ['Evento Finanças para médicos 03/10/2026', 'evento_financas_para_medicos_03_10_2026'],
  ])('%s → %s', (nome, codigo) => {
    expect(gerarCodigoOrigemCliente(nome)).toBe(codigo);
  });

  it('nome só com símbolos gera código vazio', () => {
    expect(gerarCodigoOrigemCliente('!!!')).toBe('');
  });
});
