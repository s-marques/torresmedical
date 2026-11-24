import { describe, expect, it } from 'vitest';
import {
  assinarContratoSalaSchema,
  camposCadastroPendentes,
  listOnboardingQuerySchema,
  onboardingRecepcaoInputSchema,
  ONBOARDING_ETAPAS,
  ONBOARDING_ETAPAS_OBRIGATORIAS,
  ONBOARDING_ETAPA_ROTULOS,
  tiposObrigatoriosOnboarding,
  type CadastroParaOnboarding,
} from './profissional-onboarding';

const COMPLETO: CadastroParaOnboarding = {
  nome: 'Dra. Teste',
  profissao: 'MEDICO',
  registro: 'CRM 1',
  especialidadeId: '66666666-6666-4666-8666-666666666666',
  cpf: '00000000000',
  rg: '1',
  dataNascimento: '1990-01-01',
  endereco: 'Rua Fictícia, 1',
  telefone: '11999999999',
  email: null,
  cnpj: '00000000000000',
  contatosAdministrativos: 1,
};

describe('etapas do onboarding', () => {
  it('são 9, na ordem do requisito (R §6), cada uma com rótulo', () => {
    expect(ONBOARDING_ETAPAS).toHaveLength(9);
    expect(ONBOARDING_ETAPAS[0]).toBe('CONTRATO_ASSINADO');
    expect(ONBOARDING_ETAPAS[8]).toBe('PROFISSIONAL_ATIVO');
    for (const etapa of ONBOARDING_ETAPAS) expect(ONBOARDING_ETAPA_ROTULOS[etapa]).toBeTruthy();
  });

  it('as obrigatórias para ativar são todas menos "Profissional ativo"', () => {
    expect(ONBOARDING_ETAPAS_OBRIGATORIAS).toHaveLength(8);
    expect(ONBOARDING_ETAPAS_OBRIGATORIAS).not.toContain('PROFISSIONAL_ATIVO');
  });
});

describe('camposCadastroPendentes', () => {
  it('cadastro com tudo preenchido não tem pendência', () => {
    expect(camposCadastroPendentes(COMPLETO)).toEqual([]);
  });

  it('lista os essenciais e os fiscais que faltam', () => {
    expect(
      camposCadastroPendentes({
        ...COMPLETO,
        cpf: null,
        rg: '  ',
        cnpj: null,
        contatosAdministrativos: 0,
      }),
    ).toEqual(['cpf', 'rg', 'cnpj', 'contatoAdministrativo']);
  });

  it('telefone ou e-mail bastam como contato', () => {
    expect(
      camposCadastroPendentes({ ...COMPLETO, telefone: null, email: 'a@example.com' }),
    ).toEqual([]);
    expect(camposCadastroPendentes({ ...COMPLETO, telefone: null, email: null })).toEqual([
      'contato',
    ]);
  });

  it('exige profissão, especialidade e data de nascimento', () => {
    expect(
      camposCadastroPendentes({
        ...COMPLETO,
        profissao: null,
        especialidadeId: null,
        dataNascimento: null,
      }),
    ).toEqual(['profissao', 'especialidade', 'dataNascimento']);
  });
});

describe('tiposObrigatoriosOnboarding', () => {
  it('contrato, documento pessoal, registro no conselho e licença', () => {
    expect(tiposObrigatoriosOnboarding('MEDICO', false)).toEqual([
      'CONTRATO',
      'DOCUMENTO_PESSOAL',
      'REGISTRO_CONSELHO',
      'LICENCA',
    ]);
  });

  it('acrescenta o RQE quando há RQE no cadastro', () => {
    expect(tiposObrigatoriosOnboarding('MEDICO', true)).toContain('RQE');
  });

  it('sem profissão informada usa o conjunto base', () => {
    expect(tiposObrigatoriosOnboarding(null, false)).toContain('REGISTRO_CONSELHO');
  });
});

describe('assinarContratoSalaSchema', () => {
  it('aceita data e PDF opcional', () => {
    expect(assinarContratoSalaSchema.parse({ assinadoEm: '2026-11-20' })).toEqual({
      assinadoEm: '2026-11-20',
      pdfArquivoId: null,
    });
    const id = '66666666-6666-4666-8666-666666666666';
    expect(assinarContratoSalaSchema.parse({ assinadoEm: '2026-11-20', pdfArquivoId: id })).toEqual(
      {
        assinadoEm: '2026-11-20',
        pdfArquivoId: id,
      },
    );
  });

  it('data vazia ou ausente: "Data de assinatura é obrigatória."', () => {
    for (const corpo of [{}, { assinadoEm: '' }]) {
      const resultado = assinarContratoSalaSchema.safeParse(corpo);
      expect(resultado.success).toBe(false);
      expect(resultado.error?.issues[0]?.message).toBe('Data de assinatura é obrigatória.');
    }
  });

  it('rejeita data inválida, arquivo inválido e campos extras', () => {
    expect(assinarContratoSalaSchema.safeParse({ assinadoEm: '20/11/2026' }).success).toBe(false);
    expect(
      assinarContratoSalaSchema.safeParse({ assinadoEm: '2026-11-20', pdfArquivoId: 'x' }).success,
    ).toBe(false);
    expect(assinarContratoSalaSchema.safeParse({ assinadoEm: '2026-11-20', x: 1 }).success).toBe(
      false,
    );
  });
});

describe('onboardingRecepcaoInputSchema', () => {
  it('exige o boolean', () => {
    expect(onboardingRecepcaoInputSchema.parse({ orientada: true })).toEqual({ orientada: true });
    expect(onboardingRecepcaoInputSchema.safeParse({}).success).toBe(false);
    expect(onboardingRecepcaoInputSchema.safeParse({ orientada: 'sim' }).success).toBe(false);
  });
});

describe('listOnboardingQuerySchema', () => {
  it('padrões: página 1, 10 itens, mais antigos primeiro', () => {
    const query = listOnboardingQuerySchema.parse({});
    expect(query).toMatchObject({ page: 1, pageSize: 10 });
    expect(query.sort).toEqual({ field: 'iniciadoEm', direction: 'asc' });
  });

  it('aceita o filtro de situação e a ordenação por nome', () => {
    const query = listOnboardingQuerySchema.parse({
      situacao: 'ATRASADO',
      sort: 'profissionalNome:desc',
    });
    expect(query.situacao).toBe('ATRASADO');
    expect(query.sort).toEqual({ field: 'profissionalNome', direction: 'desc' });
  });

  it('rejeita situação e ordenação desconhecidas', () => {
    expect(listOnboardingQuerySchema.safeParse({ situacao: 'X' }).success).toBe(false);
    expect(listOnboardingQuerySchema.safeParse({ sort: 'x:asc' }).success).toBe(false);
  });
});
