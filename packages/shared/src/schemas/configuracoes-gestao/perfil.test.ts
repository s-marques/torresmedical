import { describe, expect, it } from 'vitest';
import { createPerfilSchema, listPerfisQuerySchema, permissaoDaPagina } from './perfil';

function mensagens(resultado: { success: boolean; error?: { issues: { message: string }[] } }) {
  return resultado.error?.issues.map((i) => i.message);
}

describe('createPerfilSchema', () => {
  it('apara o nome, descrição vazia vira null e dedupe das páginas', () => {
    expect(
      createPerfilSchema.parse({
        nome: '  Recepção ',
        descricao: '  ',
        paginasPermitidas: ['painel.painel', 'painel.painel'],
      }),
    ).toEqual({
      nome: 'Recepção',
      descricao: null,
      paginasPermitidas: ['painel.painel'],
      escopoDados: 'TODOS',
    });
  });

  it('aceita o escopo de dados restrito aos profissionais vinculados (issue #153)', () => {
    const base = { nome: 'Médico', paginasPermitidas: ['painel.painel'] };
    expect(
      createPerfilSchema.parse({ ...base, escopoDados: 'PROFISSIONAIS_VINCULADOS' }).escopoDados,
    ).toBe('PROFISSIONAIS_VINCULADOS');
    expect(mensagens(createPerfilSchema.safeParse({ ...base, escopoDados: 'X' }))).toEqual([
      'Escopo de dados inválido',
    ]);
  });

  it('exige Nome e ao menos uma página', () => {
    expect(mensagens(createPerfilSchema.safeParse({ paginasPermitidas: [] }))).toEqual([
      'Nome é obrigatório.',
      'Selecione ao menos uma página.',
    ]);
  });

  it('rejeita página que não existe no menu e campo desconhecido', () => {
    const base = { nome: 'X', paginasPermitidas: ['painel.painel'] };
    expect(
      mensagens(
        createPerfilSchema.safeParse({ ...base, paginasPermitidas: ['pagina-que-nao-existe'] }),
      ),
    ).toEqual(['Página inválida']);
    expect(createPerfilSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe('permissaoDaPagina', () => {
  it('monta a permissão .ver a partir do id da tela', () => {
    expect(permissaoDaPagina('painel.painel')).toBe('painel.painel.ver');
  });
});

describe('listPerfisQuerySchema', () => {
  it('ordena por nome por padrão e restringe o sort', () => {
    expect(listPerfisQuerySchema.parse({}).sort).toEqual({ field: 'nome', direction: 'asc' });
    expect(listPerfisQuerySchema.safeParse({ sort: 'descricao:asc' }).success).toBe(false);
  });
});
