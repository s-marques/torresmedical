import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  createPrestadorSchema,
  exportPrestadoresQuerySchema,
  listPrestadoresQuerySchema,
  PRESTADOR_NOME_MAX,
  rotuloNotaPrestador,
} from './prestador';

function messages(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

// CNPJ e CPF fictícios com dígitos verificadores válidos.
const CNPJ = '11444777000161';
const CPF = '52998224725';

describe('createPrestadorSchema', () => {
  it('só o Nome é obrigatório: o resto assume os padrões do modal', () => {
    expect(createPrestadorSchema.parse({ nome: '  Prestador Teste ' })).toEqual({
      nome: 'Prestador Teste',
      nomeFantasia: null,
      tipoPessoa: 'FISICA',
      documento: null,
      telefone: null,
      email: null,
      status: 'ATIVO',
      endereco: null,
      categoria: 'ELETRICA',
      descricaoServico: null,
      atendeUrgencia: false,
      atendeFimSemana: false,
      formaPagamento: 'PIX',
      chavePix: null,
      valorHora: null,
      valorDiaria: null,
      emiteNotaFiscal: false,
      notaQualidade: 3,
      notaPontualidade: 3,
      avaliacaoPreco: 'JUSTO',
      observacoes: null,
    });
  });

  it('"Nome é obrigatório." com o nome vazio, em branco ou ausente', () => {
    for (const body of [{ nome: '' }, { nome: '   ' }, {}]) {
      expect(messages(createPrestadorSchema.safeParse(body))).toEqual({
        nome: 'Nome é obrigatório.',
      });
    }
  });

  it('limita o tamanho do nome', () => {
    const result = createPrestadorSchema.safeParse({ nome: 'a'.repeat(PRESTADOR_NOME_MAX + 1) });
    expect(messages(result)).toEqual({
      nome: `Nome deve ter no máximo ${PRESTADOR_NOME_MAX} caracteres`,
    });
  });

  it('guarda só os dígitos do telefone e do CPF/CNPJ e valida os dígitos verificadores', () => {
    const ok = createPrestadorSchema.parse({
      nome: 'X',
      telefone: '(65) 99999-8888',
      documento: '11.444.777/0001-61',
    });
    expect(ok).toMatchObject({ telefone: '65999998888', documento: CNPJ });
    expect(createPrestadorSchema.parse({ nome: 'X', documento: CPF }).documento).toBe(CPF);

    for (const [documento, mensagem] of [
      ['11111111111', 'CPF inválido'],
      ['11444777000162', 'CNPJ inválido'],
      ['123', 'CPF/CNPJ inválido'],
    ]) {
      expect(messages(createPrestadorSchema.safeParse({ nome: 'X', documento }))).toEqual({
        documento: mensagem,
      });
    }
    expect(messages(createPrestadorSchema.safeParse({ nome: 'X', telefone: '123' }))).toEqual({
      telefone: 'Telefone inválido',
    });
  });

  it('valida email, enums, valores e notas', () => {
    const result = createPrestadorSchema.safeParse({
      nome: 'X',
      email: 'x',
      status: 'OUTRO',
      categoria: 'OUTRA',
      formaPagamento: 'CHEQUE',
      avaliacaoPreco: 'MEDIO',
      valorHora: -1,
      notaQualidade: 6,
      notaPontualidade: 0,
    });
    expect(messages(result)).toEqual({
      email: 'Email inválido',
      status: 'Status inválido',
      categoria: 'Categoria inválida',
      formaPagamento: 'Forma de pagamento inválida',
      avaliacaoPreco: 'Avaliação de preço inválida',
      valorHora: 'Valor/Hora não pode ser negativo',
      notaQualidade: 'Qualidade do Serviço deve ser de 1 a 5',
      notaPontualidade: 'Pontualidade deve ser de 1 a 5',
    });
  });

  it('aceita a nota como texto (select do formulário)', () => {
    const dados = createPrestadorSchema.parse({
      nome: 'X',
      notaQualidade: '5',
      notaPontualidade: 1,
    });
    expect(dados).toMatchObject({ notaQualidade: 5, notaPontualidade: 1 });
  });

  it('só guarda a Chave PIX quando a forma de pagamento é PIX', () => {
    expect(
      createPrestadorSchema.parse({ nome: 'X', formaPagamento: 'PIX', chavePix: ' chave ' })
        .chavePix,
    ).toBe('chave');
    expect(
      createPrestadorSchema.parse({ nome: 'X', formaPagamento: 'BOLETO', chavePix: 'chave' })
        .chavePix,
    ).toBeNull();
  });

  it('rejeita campos fora do formulário', () => {
    expect(
      messages(createPrestadorSchema.safeParse({ nome: 'X', deletedAt: null })),
    ).toHaveProperty('_');
  });
});

describe('listPrestadoresQuerySchema', () => {
  it('aceita status, categoria, nome e busca; nome vazio vira ausente', () => {
    expect(
      listPrestadoresQuerySchema.parse({
        status: 'BLOQUEADO',
        categoria: 'TI',
        nome: ' ',
        search: 'abc',
        sort: 'avaliacao:desc',
      }),
    ).toMatchObject({
      status: 'BLOQUEADO',
      categoria: 'TI',
      nome: undefined,
      search: 'abc',
      sort: { field: 'avaliacao', direction: 'desc' },
    });
  });

  it('recusa ordenação fora da whitelist, status e categoria inválidos', () => {
    const result = listPrestadoresQuerySchema.safeParse({
      sort: 'email:asc',
      status: 'ativo',
      categoria: 'X',
    });
    expect(Object.keys(messages(result)).sort()).toEqual(['categoria', 'sort', 'status']);
  });
});

describe('exportPrestadoresQuerySchema', () => {
  it('exporta todas as colunas por padrão e recusa colunas inválidas', () => {
    expect(exportPrestadoresQuerySchema.parse({ format: 'pdf' }).columns).toEqual([
      'nome',
      'categoria',
      'telefone',
      'urgencia',
      'avaliacao',
      'status',
    ]);
    expect(
      exportPrestadoresQuerySchema.safeParse({ format: 'xlsx', columns: 'chavePix' }).success,
    ).toBe(false);
  });
});

describe('rotuloNotaPrestador', () => {
  it('mostra a nota com o rótulo', () => {
    expect([1, 2, 3, 4, 5].map(rotuloNotaPrestador)).toEqual([
      '1 - Péssimo',
      '2 - Ruim',
      '3 - Regular',
      '4 - Bom',
      '5 - Ótimo',
    ]);
    expect(rotuloNotaPrestador(9)).toBe('9');
  });
});
