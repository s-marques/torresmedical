import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  createImovelSchema,
  despesaMensalImovel,
  exportImoveisQuerySchema,
  IMOVEL_DESCRICAO_MAX,
  IMOVEL_ENDERECO_MAX,
  imovelSchema,
  listImoveisQuerySchema,
} from './imovel';

function messages(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

const VAZIO = {
  tipo: 'APARTAMENTO',
  endereco: null,
  matricula: null,
  valorCompra: null,
  dataCompra: null,
  iptuAnual: null,
  itbiPago: null,
  banco: null,
  financiamentoParcela: null,
  saldoDevedor: null,
  vencimentoFinanciamento: null,
  condominio: null,
  contaLuz: null,
  contaAgua: null,
  internet: null,
  seguro: null,
  observacoes: null,
};

describe('createImovelSchema', () => {
  it('só a Descrição é obrigatória: o resto fica vazio e o Tipo é Apartamento', () => {
    expect(createImovelSchema.parse({ descricao: '  Apto 101 ' })).toEqual({
      descricao: 'Apto 101',
      ...VAZIO,
    });
  });

  it('"Descrição é obrigatória." com a descrição vazia, em branco ou ausente', () => {
    for (const body of [{ descricao: '' }, { descricao: '   ' }, {}]) {
      expect(messages(createImovelSchema.safeParse(body))).toEqual({
        descricao: 'Descrição é obrigatória.',
      });
    }
  });

  it('campos vazios do formulário viram null', () => {
    const resultado = createImovelSchema.parse({
      descricao: 'Sala 2',
      tipo: 'SALA_COMERCIAL',
      endereco: '  ',
      matricula: '',
      dataCompra: '',
      vencimentoFinanciamento: '',
      banco: '',
      observacoes: '',
      valorCompra: null,
    });
    expect(resultado).toEqual({ ...VAZIO, descricao: 'Sala 2', tipo: 'SALA_COMERCIAL' });
  });

  it('aceita todos os campos preenchidos', () => {
    const completo = {
      descricao: 'Casa de campo',
      tipo: 'CASA',
      endereco: 'Rua Fictícia, 10',
      matricula: 'M-123',
      valorCompra: 350_000.5,
      dataCompra: '2024-03-10',
      iptuAnual: 1200,
      itbiPago: 7000,
      banco: 'Banco Teste',
      financiamentoParcela: 2500,
      saldoDevedor: 150_000,
      vencimentoFinanciamento: '2040-03-10',
      condominio: 0,
      contaLuz: 150,
      contaAgua: 80,
      internet: 100,
      seguro: 60,
      observacoes: 'Observação qualquer',
    };
    expect(createImovelSchema.parse(completo)).toEqual(completo);
  });

  it('rejeita tipo fora da lista, valores negativos, data inválida e textos longos', () => {
    expect(
      messages(
        createImovelSchema.safeParse({
          descricao: 'x'.repeat(IMOVEL_DESCRICAO_MAX + 1),
          tipo: 'CHACARA',
          endereco: 'x'.repeat(IMOVEL_ENDERECO_MAX + 1),
          valorCompra: -1,
          dataCompra: '2024-13-40',
        }),
      ),
    ).toEqual({
      descricao: `Descrição deve ter no máximo ${IMOVEL_DESCRICAO_MAX} caracteres`,
      tipo: 'Opção inválida',
      endereco: `Endereço deve ter no máximo ${IMOVEL_ENDERECO_MAX} caracteres`,
      valorCompra: 'Deve ser maior ou igual a 0',
      dataCompra: 'Data inválida',
    });
  });

  it('rejeita campos desconhecidos', () => {
    expect(createImovelSchema.safeParse({ descricao: 'A', despesaMensal: 10 }).success).toBe(false);
  });
});

describe('despesaMensalImovel', () => {
  it('soma condomínio, luz, água, internet e seguro; vazio conta 0', () => {
    expect(
      despesaMensalImovel({
        condominio: 450.1,
        contaLuz: 120.2,
        contaAgua: null,
        internet: 99.9,
        seguro: 0.1,
      }),
    ).toBe(670.3);
    expect(
      despesaMensalImovel({
        condominio: null,
        contaLuz: null,
        contaAgua: null,
        internet: null,
        seguro: null,
      }),
    ).toBe(0);
  });
});

describe('listImoveisQuerySchema e exportImoveisQuerySchema', () => {
  it('ordena por descrição por padrão e aceita as colunas ordenáveis do grid', () => {
    expect(listImoveisQuerySchema.parse({}).sort).toEqual({ field: 'descricao', direction: 'asc' });
    expect(listImoveisQuerySchema.parse({ sort: 'financiamentoParcela:desc' }).sort).toEqual({
      field: 'financiamentoParcela',
      direction: 'desc',
    });
    expect(listImoveisQuerySchema.safeParse({ sort: 'despesaMensal:asc' }).success).toBe(false);
  });

  it('exporta as colunas do grid, incluindo Desp. Mensal', () => {
    const query = exportImoveisQuerySchema.parse({
      format: 'xlsx',
      columns: 'descricao,despesaMensal',
    });
    expect(query.columns).toEqual(['descricao', 'despesaMensal']);
  });
});

describe('imovelSchema', () => {
  it('valida a resposta da API', () => {
    expect(
      imovelSchema.safeParse({
        id: '00000000-0000-4000-8000-000000000001',
        descricao: 'Apto',
        ...VAZIO,
        despesaMensal: 0,
        createdAt: '2026-11-19T12:00:00.000Z',
        updatedAt: '2026-11-19T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
