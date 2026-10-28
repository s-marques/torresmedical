import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  createFornecedorSchema,
  exportFornecedoresQuerySchema,
  FORNECEDOR_NOME_MAX,
  listFornecedoresQuerySchema,
} from './fornecedor';

function messages(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

describe('createFornecedorSchema', () => {
  it('só o Nome / Razão Social é obrigatório: o resto fica nulo e o status é ativo', () => {
    expect(createFornecedorSchema.parse({ nome: '  Distribuidora Teste ' })).toEqual({
      nome: 'Distribuidora Teste',
      nomeFantasia: null,
      documento: null,
      email: null,
      contato: null,
      telefone: null,
      celular: null,
      cep: null,
      logradouro: null,
      numero: null,
      complemento: null,
      bairro: null,
      cidade: null,
      uf: null,
      status: 'ativo',
      observacoes: null,
    });
  });

  it('nome é obrigatório (ausente, vazio ou só espaços)', () => {
    for (const input of [{}, { nome: '' }, { nome: '   ' }]) {
      expect(messages(createFornecedorSchema.safeParse(input))).toEqual({
        nome: 'Nome / Razão Social é obrigatório.',
      });
    }
  });

  it('nome acima do limite é recusado', () => {
    const resultado = createFornecedorSchema.safeParse({
      nome: 'a'.repeat(FORNECEDOR_NOME_MAX + 1),
    });
    expect(messages(resultado).nome).toContain('no máximo');
  });

  it('guarda só os dígitos de documento, telefone, celular e CEP', () => {
    const dados = createFornecedorSchema.parse({
      nome: 'A',
      documento: '11.444.777/0001-61',
      telefone: '(65) 3333-4444',
      celular: '(65) 99999-8888',
      cep: '78000-000',
    });
    expect(dados).toMatchObject({
      documento: '11444777000161',
      telefone: '6533334444',
      celular: '65999998888',
      cep: '78000000',
    });
  });

  it('aceita CPF válido e recusa CPF, CNPJ e tamanhos inválidos', () => {
    expect(createFornecedorSchema.parse({ nome: 'A', documento: '529.982.247-25' }).documento).toBe(
      '52998224725',
    );
    expect(
      messages(createFornecedorSchema.safeParse({ nome: 'A', documento: '11111111111' })),
    ).toEqual({
      documento: 'CPF inválido',
    });
    expect(
      messages(createFornecedorSchema.safeParse({ nome: 'A', documento: '11444777000162' })),
    ).toEqual({
      documento: 'CNPJ inválido',
    });
    expect(messages(createFornecedorSchema.safeParse({ nome: 'A', documento: '123' }))).toEqual({
      documento: 'CNPJ/CPF inválido',
    });
  });

  it('valida email, UF e status; vazio vira nulo', () => {
    expect(messages(createFornecedorSchema.safeParse({ nome: 'A', email: 'x' }))).toEqual({
      email: 'Email inválido',
    });
    expect(messages(createFornecedorSchema.safeParse({ nome: 'A', uf: 'XX' }))).toHaveProperty(
      'uf',
    );
    expect(messages(createFornecedorSchema.safeParse({ nome: 'A', status: 'x' }))).toHaveProperty(
      'status',
    );
    expect(createFornecedorSchema.parse({ nome: 'A', email: '', uf: '' })).toMatchObject({
      email: null,
      uf: null,
    });
    expect(createFornecedorSchema.parse({ nome: 'A', uf: 'MT', status: 'inativo' })).toMatchObject({
      uf: 'MT',
      status: 'inativo',
    });
  });

  it('recusa campos desconhecidos', () => {
    expect(createFornecedorSchema.safeParse({ nome: 'A', x: 1 }).success).toBe(false);
  });
});

describe('listFornecedoresQuerySchema', () => {
  it('ordena por nome por padrão e aceita o chip de status', () => {
    const query = listFornecedoresQuerySchema.parse({ status: 'ativo' });
    expect(query).toMatchObject({ sort: { field: 'nome', direction: 'asc' }, status: 'ativo' });
  });

  it('recusa ordenação fora da whitelist e status inválido', () => {
    expect(listFornecedoresQuerySchema.safeParse({ sort: 'uf:asc' }).success).toBe(false);
    expect(listFornecedoresQuerySchema.safeParse({ status: 'x' }).success).toBe(false);
  });
});

describe('exportFornecedoresQuerySchema', () => {
  it('exige o formato e limita as colunas às exportáveis', () => {
    expect(exportFornecedoresQuerySchema.safeParse({}).success).toBe(false);
    expect(
      exportFornecedoresQuerySchema.safeParse({ format: 'xlsx', columns: 'nome,uf' }).success,
    ).toBe(false);
    expect(
      exportFornecedoresQuerySchema.parse({ format: 'pdf', columns: 'nome,cidade' }).columns,
    ).toEqual(['nome', 'cidade']);
  });
});
