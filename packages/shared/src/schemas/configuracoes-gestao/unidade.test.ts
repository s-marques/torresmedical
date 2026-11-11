import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  createUnidadeSchema,
  exportUnidadesQuerySchema,
  listUnidadesQuerySchema,
  UNIDADE_NOME_MAX,
  unidadePageSchema,
  updateUnidadeSchema,
} from './unidade';

const EMPRESA_ID = '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';

function fieldMessages(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

describe('createUnidadeSchema', () => {
  it('apara o nome, assume ativo e não exige mais nada', () => {
    expect(createUnidadeSchema.parse({ nome: '  Matriz ' })).toEqual({
      nome: 'Matriz',
      endereco: null,
      cidade: null,
      uf: null,
      telefone: null,
      cnpj: null,
      cnes: null,
      ativo: true,
    });
  });

  it('mensagem do nome obrigatório', () => {
    expect(fieldMessages(createUnidadeSchema.safeParse({}))).toEqual({ nome: 'Informe o nome' });
    expect(fieldMessages(createUnidadeSchema.safeParse({ nome: '   ' }))).toEqual({
      nome: 'Informe o nome',
    });
  });

  it('não aceita mais empresaId no corpo: vem do usuário logado', () => {
    expect(createUnidadeSchema.safeParse({ nome: 'Matriz', empresaId: EMPRESA_ID }).success).toBe(
      false,
    );
  });

  it('limite do nome, tipo inválido e campo não permitido', () => {
    expect(
      fieldMessages(
        createUnidadeSchema.safeParse({ nome: 'x'.repeat(UNIDADE_NOME_MAX + 1), extra: 1 }),
      ),
    ).toEqual({
      nome: 'O nome deve ter no máximo 120 caracteres',
      _: 'Campo não permitido: extra',
    });
    expect(fieldMessages(createUnidadeSchema.safeParse({ nome: 1 }))).toEqual({
      nome: 'Nome inválido',
    });
  });

  it('valida CNPJ, telefone, UF e CNES quando preenchidos', () => {
    const resultado = fieldMessages(
      createUnidadeSchema.safeParse({ nome: 'Matriz', cnpj: '00000000000000', uf: 'XX' }),
    );
    expect(resultado).toHaveProperty('cnpj', 'CNPJ inválido');
    expect(resultado).toHaveProperty('uf');
    expect(
      fieldMessages(createUnidadeSchema.safeParse({ nome: 'Matriz', telefone: '123' })),
    ).toEqual({
      telefone: 'Telefone inválido',
    });
    expect(fieldMessages(createUnidadeSchema.safeParse({ nome: 'Matriz', cnes: '123' }))).toEqual({
      cnes: 'CNES inválido',
    });
    expect(
      createUnidadeSchema.parse({ nome: 'Matriz', cnpj: '11.222.333/0001-81', uf: 'MT' }),
    ).toMatchObject({ cnpj: '11222333000181', uf: 'MT' });
  });
});

describe('updateUnidadeSchema', () => {
  it('exige ao menos um campo e não aceita empresaId', () => {
    expect(fieldMessages(updateUnidadeSchema.safeParse({}))).toEqual({
      _: 'Informe ao menos um campo para alterar',
    });
    expect(updateUnidadeSchema.safeParse({ empresaId: EMPRESA_ID, nome: 'X' }).success).toBe(false);
    expect(updateUnidadeSchema.parse({ ativo: false })).toEqual({ ativo: false });
  });
});

describe('listagem e exportação', () => {
  it('ordenação padrão por nome e filtro de status (sem empresaId: vem do usuário logado)', () => {
    expect(listUnidadesQuerySchema.parse({ status: 'inativo' })).toMatchObject({
      sort: { field: 'nome', direction: 'asc' },
      status: 'inativo',
    });
    expect(listUnidadesQuerySchema.safeParse({ sort: 'empresaId:asc' }).success).toBe(false);
  });

  it('exportação com as colunas do grid', () => {
    expect(exportUnidadesQuerySchema.parse({ format: 'pdf' }).columns).toEqual([
      'nome',
      'status',
      'createdAt',
    ]);
  });

  it('resposta paginada', () => {
    const page = {
      data: [
        {
          id: EMPRESA_ID,
          empresaId: EMPRESA_ID,
          nome: 'Matriz',
          endereco: null,
          cidade: null,
          uf: null,
          telefone: null,
          cnpj: null,
          cnes: null,
          ativo: true,
          createdAt: '2026-10-14T12:00:00.000Z',
          updatedAt: '2026-10-14T12:00:00.000Z',
        },
      ],
      meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    };
    expect(unidadePageSchema.parse(page)).toEqual(page);
  });
});
