import { describe, expect, it } from 'vitest';
import {
  cnpjValido,
  cpfValido,
  createPacienteSchema,
  exportPacientesQuerySchema,
  listPacientesQuerySchema,
} from './paciente';

describe('cpfValido / cnpjValido', () => {
  it('aceita documentos válidos, com ou sem máscara', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
  });

  it('recusa tamanho errado, dígitos repetidos e dígito verificador errado', () => {
    expect(cpfValido('123')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
    expect(cpfValido('52998224726')).toBe(false);
    expect(cnpjValido('11222333000182')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
    expect(cnpjValido('52998224725')).toBe(false);
  });
});

describe('createPacienteSchema', () => {
  it('só o nome é obrigatório, com a mensagem do sistema atual', () => {
    const resultado = createPacienteSchema.safeParse({ nome: '  ' });

    expect(resultado.error?.issues.map((i) => i.message)).toEqual([
      'O nome do paciente é obrigatório.',
    ]);
    expect(createPacienteSchema.safeParse({}).success).toBe(false);
  });

  it('aplica padrões e transforma vazio em null, guardando só os dígitos', () => {
    const { data } = createPacienteSchema.safeParse({
      nome: ' Ana ',
      email: '',
      celular: '(65) 99999-0001',
      cep: '78000-000',
      uf: 'mt',
      sexo: '',
    });

    expect(data).toMatchObject({
      nome: 'Ana',
      tipo: 'PF',
      status: 'ATIVO',
      aceitaCampanhasWhatsapp: true,
      email: null,
      celular: '65999990001',
      cep: '78000000',
      uf: 'MT',
      sexo: null,
    });
  });

  it('valida CPF para PF e CNPJ para PJ', () => {
    const erro = (dados: object) =>
      createPacienteSchema.safeParse({ nome: 'X', ...dados }).error?.issues[0];

    expect(erro({ documento: '52998224726' })).toMatchObject({
      path: ['documento'],
      message: 'CPF inválido',
    });
    expect(erro({ tipo: 'PJ', documento: '52998224725' })?.message).toBe('CNPJ inválido');
    expect(erro({ tipo: 'PJ', documento: '11222333000181' })).toBeUndefined();
  });

  it('descarta os campos do outro tipo de pessoa', () => {
    const pj = createPacienteSchema.parse({
      tipo: 'PJ',
      nome: 'Empresa',
      rg: '1',
      sexo: 'OUTRO',
      menorIdade: true,
      razaoSocial: 'Empresa LTDA',
    });
    const pf = createPacienteSchema.parse({
      nome: 'Ana',
      razaoSocial: 'X',
      representanteNome: 'Y',
    });

    expect(pj).toMatchObject({
      rg: null,
      sexo: null,
      menorIdade: false,
      razaoSocial: 'Empresa LTDA',
    });
    expect(pf).toMatchObject({ razaoSocial: null, representanteNome: null });
  });

  it('recusa campos não permitidos', () => {
    expect(createPacienteSchema.safeParse({ nome: 'X', deletedAt: null }).success).toBe(false);
  });
});

describe('listagem', () => {
  it('padrão: por nome; aceita status e ordenação da whitelist', () => {
    expect(listPacientesQuerySchema.parse({}).sort).toEqual({ field: 'nome', direction: 'asc' });
    expect(
      listPacientesQuerySchema.safeParse({ status: 'NOVO', sort: 'origem:desc' }).success,
    ).toBe(true);
    expect(listPacientesQuerySchema.safeParse({ sort: 'documento:asc' }).success).toBe(false);
    expect(listPacientesQuerySchema.safeParse({ status: 'x' }).success).toBe(false);
  });

  it('exportação: todas as colunas por padrão', () => {
    expect(exportPacientesQuerySchema.parse({ format: 'xlsx' }).columns).toHaveLength(6);
  });
});
