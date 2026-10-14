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
  it('apara o nome e assume ativo', () => {
    expect(createUnidadeSchema.parse({ empresaId: EMPRESA_ID, nome: '  Matriz ' })).toEqual({
      empresaId: EMPRESA_ID,
      nome: 'Matriz',
      ativo: true,
    });
  });

  it('mensagens dos obrigatórios', () => {
    expect(fieldMessages(createUnidadeSchema.safeParse({}))).toEqual({
      empresaId: 'Informe a empresa',
      nome: 'Informe o nome',
    });
    expect(fieldMessages(createUnidadeSchema.safeParse({ empresaId: 'x', nome: '   ' }))).toEqual({
      empresaId: 'Empresa inválida',
      nome: 'Informe o nome',
    });
  });

  it('limite do nome, tipo inválido e campo não permitido', () => {
    expect(
      fieldMessages(
        createUnidadeSchema.safeParse({
          empresaId: EMPRESA_ID,
          nome: 'x'.repeat(UNIDADE_NOME_MAX + 1),
          extra: 1,
        }),
      ),
    ).toEqual({
      nome: 'O nome deve ter no máximo 120 caracteres',
      _: 'Campo não permitido: extra',
    });
    expect(
      fieldMessages(createUnidadeSchema.safeParse({ empresaId: EMPRESA_ID, nome: 1 })),
    ).toEqual({
      nome: 'Nome inválido',
    });
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
  it('ordenação padrão por nome e filtros de status/empresa', () => {
    expect(
      listUnidadesQuerySchema.parse({ status: 'inativo', empresaId: EMPRESA_ID }),
    ).toMatchObject({
      sort: { field: 'nome', direction: 'asc' },
      status: 'inativo',
      empresaId: EMPRESA_ID,
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
