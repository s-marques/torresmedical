import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  empresaInputSchema,
  empresaLogoInputSchema,
  empresaSchema,
  EMPRESA_NOME_MAX,
} from './empresa';

const CNPJ_VALIDO = '11222333000181';
const CPF_VALIDO = '52998224725';

function fieldMessages(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

describe('empresaInputSchema', () => {
  const base = {
    nome: 'Torres Medical Center',
    documento: CNPJ_VALIDO,
    email: 'contato@torresmedical.com',
    telefone: '65999998888',
  };

  it('aceita CNPJ ou CPF válidos, com máscara, guardando só os dígitos', () => {
    expect(empresaInputSchema.parse(base)).toMatchObject({ documento: CNPJ_VALIDO });
    expect(empresaInputSchema.parse({ ...base, documento: '11.222.333/0001-81' })).toMatchObject({
      documento: CNPJ_VALIDO,
    });
    expect(empresaInputSchema.parse({ ...base, documento: CPF_VALIDO })).toMatchObject({
      documento: CPF_VALIDO,
    });
  });

  it('rejeita documento inválido (tamanho errado ou dígitos verificadores errados)', () => {
    expect(fieldMessages(empresaInputSchema.safeParse({ ...base, documento: '123' }))).toEqual({
      documento: 'CNPJ / CPF inválido',
    });
    expect(
      fieldMessages(empresaInputSchema.safeParse({ ...base, documento: '11222333000199' })),
    ).toEqual({ documento: 'CNPJ / CPF inválido' });
    expect(
      fieldMessages(empresaInputSchema.safeParse({ ...base, documento: '52998224726' })),
    ).toEqual({ documento: 'CNPJ / CPF inválido' });
  });

  it('exige o nome e respeita o tamanho máximo', () => {
    expect(fieldMessages(empresaInputSchema.safeParse({ ...base, nome: '  ' }))).toEqual({
      nome: 'Nome da Empresa é obrigatório.',
    });
    expect(
      fieldMessages(
        empresaInputSchema.safeParse({ ...base, nome: 'x'.repeat(EMPRESA_NOME_MAX + 1) }),
      ),
    ).toEqual({ nome: `Nome da Empresa deve ter no máximo ${EMPRESA_NOME_MAX} caracteres` });
  });

  it('e-mail e telefone são opcionais; vazio ou ausente vira null', () => {
    expect(empresaInputSchema.parse({ ...base, email: null, telefone: null })).toMatchObject({
      email: null,
      telefone: null,
    });
    expect(fieldMessages(empresaInputSchema.safeParse({ ...base, email: 'invalido' }))).toEqual({
      email: 'E-mail inválido',
    });
  });

  it('telefone: guarda só os dígitos e exige 10 ou 11', () => {
    expect(empresaInputSchema.parse({ ...base, telefone: '(65) 99999-8888' })).toMatchObject({
      telefone: '65999998888',
    });
    expect(fieldMessages(empresaInputSchema.safeParse({ ...base, telefone: '123' }))).toEqual({
      telefone: 'Telefone inválido',
    });
  });

  it('rejeita campos fora do schema', () => {
    expect(empresaInputSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe('empresaSchema', () => {
  it('representa a resposta da API', () => {
    const empresa = {
      id: '00000000-0000-4000-8000-000000000001',
      nome: 'Torres Medical',
      documento: CNPJ_VALIDO,
      email: null,
      telefone: null,
      logoArquivoId: null,
      createdAt: '2026-10-14T12:00:00.000Z',
      updatedAt: '2026-10-14T12:00:00.000Z',
    };
    expect(empresaSchema.parse(empresa)).toEqual(empresa);
  });
});

describe('empresaLogoInputSchema', () => {
  it('aceita o id do arquivo ou null (remove)', () => {
    const id = '00000000-0000-4000-8000-000000000002';
    expect(empresaLogoInputSchema.parse({ arquivoId: id })).toEqual({ arquivoId: id });
    expect(empresaLogoInputSchema.parse({ arquivoId: null })).toEqual({ arquivoId: null });
    expect(fieldMessages(empresaLogoInputSchema.safeParse({ arquivoId: 'x' }))).toEqual({
      arquivoId: 'Arquivo inválido',
    });
  });
});
