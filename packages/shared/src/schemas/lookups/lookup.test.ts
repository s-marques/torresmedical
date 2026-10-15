import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import { isPermissao } from '../../auth/permissoes';
import {
  LOOKUP_ENTIDADES,
  LOOKUP_PERMISSOES,
  lookupPageSchema,
  lookupPath,
  lookupQuerySchemas,
} from './lookup';

const ID = '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';

function campos(result: { error?: { issues: { path: PropertyKey[] }[] } }) {
  return (result.error?.issues ?? []).map((i) => i.path.join('.'));
}

describe('lookupQuerySchemas', () => {
  it('tem um schema por entidade', () => {
    expect(Object.keys(lookupQuerySchemas).sort((a, b) => a.localeCompare(b))).toEqual(
      [...LOOKUP_ENTIDADES].sort((a, b) => a.localeCompare(b)),
    );
  });

  it.each(LOOKUP_ENTIDADES)('%s: padrão página 1, 10 itens, ordem por nome', (entidade) => {
    expect(lookupQuerySchemas[entidade].parse({ search: '  ana  ' })).toMatchObject({
      page: 1,
      pageSize: 10,
      sort: { field: 'nome', direction: 'asc' },
      search: 'ana',
    });
  });

  it('aceita os filtros de cada entidade', () => {
    expect(lookupQuerySchemas.produtos.parse({ tipo: 'servico' }).tipo).toBe('servico');
    expect(lookupQuerySchemas.categorias.parse({ tipo: 'produto' }).tipo).toBe('produto');
    expect(lookupQuerySchemas['formas-pagamento'].parse({ finalidade: 'pagar' }).finalidade).toBe(
      'pagar',
    );
    expect(lookupQuerySchemas.profissionais.parse({ especialidadeId: ID }).especialidadeId).toBe(
      ID,
    );
    expect(lookupQuerySchemas.unidades.parse({ empresaId: ID }).empresaId).toBe(ID);
  });

  it('recusa filtros inválidos com mensagem em português', () => {
    const tipo = lookupQuerySchemas.produtos.safeParse({ tipo: 'outro' });
    expect(tipo.error?.issues[0]?.message).toBe('Tipo deve ser produto ou servico');

    const finalidade = lookupQuerySchemas['formas-pagamento'].safeParse({ finalidade: 'x' });
    expect(finalidade.error?.issues[0]?.message).toBe('Finalidade deve ser receber ou pagar');

    expect(campos(lookupQuerySchemas.profissionais.safeParse({ especialidadeId: '1' }))).toEqual([
      'especialidadeId',
    ]);
    expect(campos(lookupQuerySchemas.unidades.safeParse({ empresaId: 'x' }))).toEqual([
      'empresaId',
    ]);
  });

  it('só ordena por nome', () => {
    expect(campos(lookupQuerySchemas.pacientes.safeParse({ sort: 'documento:asc' }))).toEqual([
      'sort',
    ]);
  });
});

describe('LOOKUP_PERMISSOES', () => {
  it.each(LOOKUP_ENTIDADES)('%s: exige permissões `ver` do catálogo', (entidade) => {
    const permissoes = LOOKUP_PERMISSOES[entidade];

    expect(permissoes.length).toBeGreaterThan(0);
    expect(permissoes.every((p) => isPermissao(p) && p.endsWith('.ver'))).toBe(true);
  });

  it('inclui a tela dona da entidade', () => {
    expect(LOOKUP_PERMISSOES.pacientes).toContain('comercial-atendimento.pacientes.ver');
    expect(LOOKUP_PERMISSOES.categorias).toContain('compras-estoque.categorias.ver');
    expect(LOOKUP_PERMISSOES['formas-pagamento']).toContain('financeiro.formas-pagamento.ver');
    expect(LOOKUP_PERMISSOES['tipos-agendamento']).toContain(
      'configuracoes-gestao.tipos-agendamento.ver',
    );
  });
});

describe('lookupPageSchema e lookupPath', () => {
  it('valida a resposta paginada', () => {
    const page = {
      data: [{ id: ID, label: 'Consulta', descricao: null }],
      meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    };
    expect(lookupPageSchema.parse(page)).toEqual(page);
    expect(lookupPageSchema.safeParse({ data: [{ id: ID }], meta: page.meta }).success).toBe(false);
  });

  it('monta o caminho da API', () => {
    expect(lookupPath('formas-pagamento')).toBe('/api/lookups/formas-pagamento');
  });
});
