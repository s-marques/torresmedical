import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  createVeiculoSchema,
  exportVeiculosQuerySchema,
  listVeiculosQuerySchema,
  VEICULO_DESCRICAO_MAX,
  VEICULO_PLACA_MAX,
  veiculoSchema,
} from './veiculo';

function messages(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

const VAZIO = {
  tipo: 'CARRO',
  placa: null,
  renavam: null,
  chassi: null,
  ano: null,
  cor: null,
  uso: 'CLINICA',
  valorCompra: null,
  dataCompra: null,
  ipvaAnual: null,
  licenciamento: null,
  seguroAnual: null,
  vencimentoSeguro: null,
  banco: null,
  financiamentoParcela: null,
  saldoDevedor: null,
  vencimentoFinanciamento: null,
  observacoes: null,
};

describe('createVeiculoSchema', () => {
  it('só a Descrição é obrigatória: Tipo é Carro e Uso é Clínica por padrão', () => {
    expect(createVeiculoSchema.parse({ descricao: '  Carro 1 ' })).toEqual({
      descricao: 'Carro 1',
      ...VAZIO,
    });
  });

  it('"Descrição é obrigatória." com a descrição vazia, em branco ou ausente', () => {
    for (const body of [{ descricao: '' }, { descricao: '   ' }, {}]) {
      expect(messages(createVeiculoSchema.safeParse(body))).toEqual({
        descricao: 'Descrição é obrigatória.',
      });
    }
  });

  it('campos vazios do formulário viram null', () => {
    expect(
      createVeiculoSchema.parse({
        descricao: 'Moto',
        tipo: 'MOTO',
        uso: 'MISTO',
        placa: '  ',
        cor: '',
        ano: null,
        dataCompra: '',
        vencimentoSeguro: '',
        vencimentoFinanciamento: '',
        banco: '',
        observacoes: '',
        ipvaAnual: null,
      }),
    ).toEqual({ ...VAZIO, descricao: 'Moto', tipo: 'MOTO', uso: 'MISTO' });
  });

  it('aceita todos os campos preenchidos', () => {
    const completo = {
      descricao: 'Utilitário da clínica',
      tipo: 'UTILITARIO',
      placa: 'ABC1D23',
      renavam: '12345678901',
      chassi: '9BWZZZ377VT004251',
      ano: 2024,
      cor: 'Branco',
      uso: 'PESSOAL',
      valorCompra: 120_000.5,
      dataCompra: '2024-03-10',
      ipvaAnual: 3200,
      licenciamento: 160,
      seguroAnual: 4100,
      vencimentoSeguro: '2027-03-10',
      banco: 'Banco Teste',
      financiamentoParcela: 2500,
      saldoDevedor: 90_000,
      vencimentoFinanciamento: '2029-03-10',
      observacoes: 'Observação qualquer',
    };
    expect(createVeiculoSchema.parse(completo)).toEqual(completo);
  });

  it('rejeita tipo e uso fora da lista, valores negativos, ano, data inválida e textos longos', () => {
    expect(
      messages(
        createVeiculoSchema.safeParse({
          descricao: 'x'.repeat(VEICULO_DESCRICAO_MAX + 1),
          tipo: 'BARCO',
          uso: 'OUTRO',
          placa: 'x'.repeat(VEICULO_PLACA_MAX + 1),
          ano: 1800,
          ipvaAnual: -1,
          dataCompra: '2024-13-40',
        }),
      ),
    ).toEqual({
      descricao: `Descrição deve ter no máximo ${VEICULO_DESCRICAO_MAX} caracteres`,
      tipo: 'Opção inválida',
      uso: 'Opção inválida',
      placa: `Placa deve ter no máximo ${VEICULO_PLACA_MAX} caracteres`,
      ano: 'Deve ser maior ou igual a 1900',
      ipvaAnual: 'Deve ser maior ou igual a 0',
      dataCompra: 'Data inválida',
    });
  });

  it('rejeita campos desconhecidos', () => {
    expect(createVeiculoSchema.safeParse({ descricao: 'A', id: 'x' }).success).toBe(false);
  });
});

describe('listVeiculosQuerySchema e exportVeiculosQuerySchema', () => {
  it('ordena por descrição por padrão e aceita as colunas ordenáveis do grid', () => {
    expect(listVeiculosQuerySchema.parse({}).sort).toEqual({
      field: 'descricao',
      direction: 'asc',
    });
    expect(listVeiculosQuerySchema.parse({ sort: 'ipvaAnual:desc' }).sort).toEqual({
      field: 'ipvaAnual',
      direction: 'desc',
    });
    expect(listVeiculosQuerySchema.safeParse({ sort: 'chassi:asc' }).success).toBe(false);
  });

  it('exporta as colunas do grid', () => {
    const query = exportVeiculosQuerySchema.parse({ format: 'xlsx', columns: 'descricao,placa' });
    expect(query.columns).toEqual(['descricao', 'placa']);
  });
});

describe('veiculoSchema', () => {
  it('valida a resposta da API', () => {
    expect(
      veiculoSchema.safeParse({
        id: '00000000-0000-4000-8000-000000000001',
        descricao: 'Carro',
        ...VAZIO,
        createdAt: '2026-11-19T12:00:00.000Z',
        updatedAt: '2026-11-19T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
