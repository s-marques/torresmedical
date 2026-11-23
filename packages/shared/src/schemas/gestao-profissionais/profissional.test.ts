import { describe, expect, it } from 'vitest';
import {
  PROFISSIONAL_PROFISSOES,
  PROFISSIONAL_RQES_MAX,
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

describe('cadastro completo (issue #140)', () => {
  const ESP_A = '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';
  const ESP_B = '9c1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';

  it('campos novos são opcionais: sem eles, profissão e CNPJ são null e as listas vazias', () => {
    expect(createProfissionalSchema.parse({ nome: 'Ana' })).toMatchObject({
      profissao: null,
      subespecialidade: null,
      cnpj: null,
      rqes: [],
      contatosAdministrativos: [],
    });
  });

  it('guarda só os dígitos do CNPJ e valida os dígitos verificadores', () => {
    expect(createProfissionalSchema.parse({ nome: 'Ana', cnpj: '11.222.333/0001-81' }).cnpj).toBe(
      '11222333000181',
    );
    expect(createProfissionalSchema.parse({ nome: 'Ana', cnpj: '' }).cnpj).toBeNull();
    expect(
      detalhes(createProfissionalSchema.safeParse({ nome: 'Ana', cnpj: '11222333000182' })),
    ).toEqual([['cnpj', 'CNPJ inválido']]);
  });

  it('profissão aceita a lista do cadastro e rejeita outra', () => {
    for (const profissao of PROFISSIONAL_PROFISSOES) {
      expect(createProfissionalSchema.parse({ nome: 'Ana', profissao }).profissao).toBe(profissao);
    }
    expect(createProfissionalSchema.parse({ nome: 'Ana', profissao: '' }).profissao).toBeNull();
    expect(
      detalhes(createProfissionalSchema.safeParse({ nome: 'Ana', profissao: 'MAGO' })),
    ).toEqual([['profissao', 'Profissão inválida']]);
  });

  it('RQE: número obrigatório, especialidade válida e uma por especialidade', () => {
    const dados = createProfissionalSchema.parse({
      nome: 'Ana',
      rqes: [
        { numero: ' 4321 ', especialidadeId: ESP_A },
        { numero: '99', especialidadeId: ESP_B },
      ],
    });
    expect(dados.rqes).toEqual([
      { numero: '4321', especialidadeId: ESP_A },
      { numero: '99', especialidadeId: ESP_B },
    ]);
    expect(
      detalhes(
        createProfissionalSchema.safeParse({
          nome: 'Ana',
          rqes: [{ numero: ' ', especialidadeId: 'x' }],
        }),
      ),
    ).toEqual([
      ['rqes.0.numero', 'Número do RQE é obrigatório.'],
      ['rqes.0.especialidadeId', 'Especialidade do RQE inválida'],
    ]);
    expect(
      detalhes(
        createProfissionalSchema.safeParse({
          nome: 'Ana',
          rqes: [
            { numero: '1', especialidadeId: ESP_A },
            { numero: '2', especialidadeId: ESP_A },
          ],
        }),
      ),
    ).toEqual([['rqes', 'Há mais de um RQE para a mesma especialidade']]);
  });

  it('contato administrativo: nome e função obrigatórios, telefone ou e-mail, só dígitos no telefone', () => {
    const dados = createProfissionalSchema.parse({
      nome: 'Ana',
      contatosAdministrativos: [
        { nome: 'Bia', funcao: 'Secretária', telefone: '(65) 99999-0002', email: '' },
        { nome: 'Caio', funcao: 'Financeiro', email: 'caio@exemplo.test' },
      ],
    });
    expect(dados.contatosAdministrativos).toEqual([
      { nome: 'Bia', funcao: 'Secretária', telefone: '65999990002', email: null },
      { nome: 'Caio', funcao: 'Financeiro', telefone: null, email: 'caio@exemplo.test' },
    ]);
    expect(
      detalhes(
        createProfissionalSchema.safeParse({
          nome: 'Ana',
          contatosAdministrativos: [{ nome: '', funcao: '', telefone: '123' }],
        }),
      ),
    ).toEqual([
      ['contatosAdministrativos.0.nome', 'Nome do contato é obrigatório.'],
      ['contatosAdministrativos.0.funcao', 'Função do contato é obrigatória.'],
      ['contatosAdministrativos.0.telefone', 'Telefone do contato inválido'],
    ]);
    expect(
      detalhes(
        createProfissionalSchema.safeParse({
          nome: 'Ana',
          contatosAdministrativos: [{ nome: 'Bia', funcao: 'Secretária' }],
        }),
      ),
    ).toEqual([
      ['contatosAdministrativos.0.telefone', 'Informe o telefone ou o e-mail do contato'],
    ]);
  });

  it('limita a quantidade de RQEs e de contatos', () => {
    const muitos = Array.from({ length: PROFISSIONAL_RQES_MAX + 1 }, (_, i) => ({
      numero: String(i),
      especialidadeId: ESP_A,
    }));
    expect(createProfissionalSchema.safeParse({ nome: 'Ana', rqes: muitos }).success).toBe(false);
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
