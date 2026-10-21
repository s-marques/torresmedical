import { describe, expect, it } from 'vitest';
import {
  createProfissionalSchema,
  exportProfissionaisQuerySchema,
  listProfissionaisQuerySchema,
  profissionalStatusSchema,
} from './profissional';
import { createEspecialidadeSchema } from './especialidade';

function detalhes(resultado: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return resultado.error?.issues.map((i) => [i.path.join('.'), i.message]);
}

describe('createProfissionalSchema', () => {
  it('só o nome é obrigatório; os padrões são os do modal Novo Profissional', () => {
    const dados = createProfissionalSchema.parse({ nome: '  Dra. Teste  ' });

    expect(dados).toMatchObject({
      nome: 'Dra. Teste',
      duracaoPadrao: 30,
      corCalendario: 'azul',
      layoutReceita: 'PADRAO',
      valorConsulta: null,
      comissao: null,
      cpf: null,
      memedSecretKey: null,
    });
    expect(detalhes(createProfissionalSchema.safeParse({ nome: ' ' }))).toEqual([
      ['nome', 'O nome do profissional é obrigatório.'],
    ]);
    expect(detalhes(createProfissionalSchema.safeParse({}))).toEqual([
      ['nome', 'O nome do profissional é obrigatório.'],
    ]);
  });

  it('guarda só os dígitos de CPF e telefones e transforma vazio em null', () => {
    const dados = createProfissionalSchema.parse({
      nome: 'X',
      cpf: '529.982.247-25',
      telefone: '(65) 99999-0001',
      telefoneReceita: '',
      email: '',
      registro: '  ',
      estadoCivil: '',
      especialidadeId: '',
      dataNascimento: '',
    });

    expect(dados).toMatchObject({
      cpf: '52998224725',
      telefone: '65999990001',
      telefoneReceita: null,
      email: null,
      registro: null,
      estadoCivil: null,
      especialidadeId: null,
      dataNascimento: null,
    });
  });

  it('valida CPF, email, telefone, comissão, duração, cor e layout', () => {
    const erros = (extra: object) =>
      detalhes(createProfissionalSchema.safeParse({ nome: 'X', ...extra }));

    expect(erros({ cpf: '11111111111' })).toEqual([['cpf', 'CPF inválido']]);
    expect(erros({ email: 'x' })).toEqual([['email', 'Email inválido']]);
    expect(erros({ telefone: '123' })).toEqual([['telefone', 'Telefone inválido']]);
    expect(erros({ comissao: 100.01 })).toEqual([
      ['comissao', 'A comissão deve ser de no máximo 100%'],
    ]);
    expect(erros({ comissao: -1 })).toEqual([['comissao', 'Comissão não pode ser negativo']]);
    expect(erros({ valorConsulta: -5 })).toEqual([
      ['valorConsulta', 'Valor da consulta não pode ser negativo'],
    ]);
    expect(erros({ duracaoPadrao: 0 })).toEqual([
      ['duracaoPadrao', 'A duração deve ser de pelo menos 1 minuto'],
    ]);
    expect(erros({ duracaoPadrao: 1441 })).toEqual([
      ['duracaoPadrao', 'A duração deve ser de no máximo 1440 minutos'],
    ]);
    expect(erros({ corCalendario: 'neon' })).toEqual([['corCalendario', 'Cor inválida']]);
    expect(erros({ layoutReceita: 'x' })).toEqual([['layoutReceita', 'Layout inválido']]);
    expect(erros({ cpf: null, comissao: 0, valorConsulta: 0 })).toBeUndefined();
  });

  it('não aceita campos fora do formulário', () => {
    expect(createProfissionalSchema.safeParse({ nome: 'X', ativo: false }).success).toBe(false);
  });
});

describe('profissionalStatusSchema e especialidade', () => {
  it('Ativar/Desativar exige o booleano', () => {
    expect(profissionalStatusSchema.safeParse({ ativo: false }).success).toBe(true);
    expect(profissionalStatusSchema.safeParse({}).success).toBe(false);
  });

  it('especialidade: nome obrigatório, aparado', () => {
    expect(createEspecialidadeSchema.parse({ nome: '  Cardiologia ' })).toEqual({
      nome: 'Cardiologia',
    });
    expect(detalhes(createEspecialidadeSchema.safeParse({ nome: '' }))).toEqual([
      ['nome', 'Informe o nome da especialidade'],
    ]);
  });
});

describe('listagem e exportação', () => {
  it('padrões: página 1, 10 por página, nome:asc; aceita status e ordenação por coluna', () => {
    expect(listProfissionaisQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 10,
      sort: { field: 'nome', direction: 'asc' },
    });
    expect(
      listProfissionaisQuerySchema.parse({ sort: 'valorConsulta:desc', status: 'inativo' }),
    ).toMatchObject({ sort: { field: 'valorConsulta', direction: 'desc' }, status: 'inativo' });
    expect(listProfissionaisQuerySchema.safeParse({ sort: 'cpf:asc' }).success).toBe(false);
    expect(listProfissionaisQuerySchema.safeParse({ status: 'x' }).success).toBe(false);
  });

  it('exportação: formato obrigatório e só colunas do grid', () => {
    expect(
      exportProfissionaisQuerySchema.parse({ format: 'xlsx', columns: 'nome,ativo' }).columns,
    ).toEqual(['nome', 'ativo']);
    expect(
      exportProfissionaisQuerySchema.safeParse({ format: 'xlsx', columns: 'cpf' }).success,
    ).toBe(false);
    expect(exportProfissionaisQuerySchema.safeParse({}).success).toBe(false);
  });
});
