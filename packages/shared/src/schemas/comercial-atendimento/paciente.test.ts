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
      email: null,
      celular: '65999990001',
      cep: '78000000',
      uf: 'MT',
      sexo: null,
      canalOrigem: null,
      whatsapp: null,
      preferenciaComunicacao: null,
      indicacaoTipo: null,
      indicacaoReferenciaId: null,
      indicacaoTexto: null,
      profissionalVinculoId: null,
      especialidadeVinculoId: null,
    });
    // Sem o campo, o consentimento de campanhas não muda (o PATCH não reativa o que foi revogado).
    expect(data).not.toHaveProperty('aceitaCampanhasWhatsapp');
    expect(data).not.toHaveProperty('consentimentos');
  });

  describe('relacionamento (issue #148)', () => {
    const ID = '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
    const parse = (dados: object) => createPacienteSchema.safeParse({ nome: 'Ana', ...dados });

    it('aceita canal, WhatsApp (só dígitos), preferência e vínculos', () => {
      const { data } = parse({
        canalOrigem: 'REDES_SOCIAIS',
        whatsapp: '(65) 98888-0001',
        preferenciaComunicacao: 'EMAIL',
        profissionalVinculoId: ID,
        especialidadeVinculoId: ID,
      });

      expect(data).toMatchObject({
        canalOrigem: 'REDES_SOCIAIS',
        whatsapp: '65988880001',
        preferenciaComunicacao: 'EMAIL',
        profissionalVinculoId: ID,
        especialidadeVinculoId: ID,
      });
    });

    it('vazio vira null nos campos opcionais', () => {
      const { data } = parse({
        canalOrigem: '',
        preferenciaComunicacao: '',
        indicacaoTipo: '',
        profissionalVinculoId: '',
        especialidadeVinculoId: '',
      });

      expect(data).toMatchObject({
        canalOrigem: null,
        preferenciaComunicacao: null,
        indicacaoTipo: null,
        profissionalVinculoId: null,
        especialidadeVinculoId: null,
      });
    });

    it('recusa canal, preferência, WhatsApp e ids inválidos', () => {
      for (const dados of [
        { canalOrigem: 'FAX' },
        { preferenciaComunicacao: 'CARTA' },
        { whatsapp: '123' },
        { profissionalVinculoId: 'abc' },
        { especialidadeVinculoId: 'abc' },
        { indicacaoTipo: 'ALGUEM' },
      ]) {
        expect(parse(dados).success).toBe(false);
      }
    });

    it('quem indicou: paciente e profissional pedem o id; texto livre pede o texto', () => {
      const campo = (dados: object) => parse(dados).error?.issues[0];

      expect(campo({ indicacaoTipo: 'PACIENTE' })).toMatchObject({
        path: ['indicacaoReferenciaId'],
        message: 'Quem indicou é obrigatório.',
      });
      expect(campo({ indicacaoTipo: 'PROFISSIONAL' })?.path).toEqual(['indicacaoReferenciaId']);
      expect(campo({ indicacaoTipo: 'TEXTO', indicacaoTexto: '  ' })?.path).toEqual([
        'indicacaoTexto',
      ]);
      expect(campo({ indicacaoTipo: 'PACIENTE', indicacaoReferenciaId: ID })).toBeUndefined();
      expect(campo({ indicacaoTipo: 'TEXTO', indicacaoTexto: 'Vizinha' })).toBeUndefined();
    });

    it('guarda só o dado do tipo escolhido e limpa o resto', () => {
      const paciente = parse({
        indicacaoTipo: 'PACIENTE',
        indicacaoReferenciaId: ID,
        indicacaoTexto: 'sobra',
      }).data;
      const texto = parse({
        indicacaoTipo: 'TEXTO',
        indicacaoTexto: ' Vizinha ',
        indicacaoReferenciaId: ID,
      }).data;
      const nenhuma = parse({ indicacaoReferenciaId: ID, indicacaoTexto: 'sobra' }).data;

      expect(paciente).toMatchObject({ indicacaoReferenciaId: ID, indicacaoTexto: null });
      expect(texto).toMatchObject({ indicacaoReferenciaId: null, indicacaoTexto: 'Vizinha' });
      expect(nenhuma).toMatchObject({ indicacaoReferenciaId: null, indicacaoTexto: null });
    });

    it('valida e mantém os consentimentos do cadastro (máximo de três)', () => {
      const consentimento = { tipo: 'CAMPANHAS', aceito: false, canal: 'PRESENCIAL' };

      expect(parse({ consentimentos: [consentimento] }).data?.consentimentos).toEqual([
        { ...consentimento, observacao: null },
      ]);
      expect(parse({ consentimentos: [{ ...consentimento, tipo: 'X' }] }).success).toBe(false);
      expect(parse({ consentimentos: Array(4).fill(consentimento) }).success).toBe(false);
    });

    it('o atalho aceitaCampanhasWhatsapp é opcional e booleano', () => {
      expect(parse({ aceitaCampanhasWhatsapp: false }).data?.aceitaCampanhasWhatsapp).toBe(false);
      expect(parse({ aceitaCampanhasWhatsapp: 'não' }).success).toBe(false);
    });
  });

  describe('filtros da listagem (issue #148)', () => {
    const ID = '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
    const parse = (query: object) => listPacientesQuerySchema.safeParse(query);

    it('lê origem, canal, sem retorno, com faltas e novos no período da query string', () => {
      const { data } = parse({
        origemClienteId: ID,
        canalOrigem: 'WHATSAPP',
        semRetornoDias: '90',
        comFaltas: 'true',
        novosDe: '2026-11-01',
        novosAte: '2026-11-30',
      });

      expect(data).toMatchObject({
        origemClienteId: ID,
        canalOrigem: 'WHATSAPP',
        semRetornoDias: 90,
        comFaltas: true,
        novosDe: '2026-11-01',
        novosAte: '2026-11-30',
      });
    });

    it('sem filtro, nenhum deles aparece; comFaltas=false vale falso', () => {
      const vazio = parse({}).data;

      expect(vazio?.comFaltas).toBeUndefined();
      expect(vazio?.semRetornoDias).toBeUndefined();
      expect(parse({ comFaltas: 'false' }).data?.comFaltas).toBe(false);
    });

    it('recusa valores fora do padrão', () => {
      for (const query of [
        { semRetornoDias: '0' },
        { semRetornoDias: '3651' },
        { semRetornoDias: '1.5' },
        { comFaltas: 'sim' },
        { canalOrigem: 'FAX' },
        { origemClienteId: 'abc' },
        { novosDe: '01/11/2026' },
      ]) {
        expect(parse(query).success).toBe(false);
      }
    });

    it('a exportação aceita os mesmos filtros', () => {
      const { data } = exportPacientesQuerySchema.safeParse({
        format: 'xlsx',
        comFaltas: 'true',
        semRetornoDias: '30',
      });

      expect(data).toMatchObject({ comFaltas: true, semRetornoDias: 30 });
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
