import { describe, expect, it } from 'vitest';
import {
  listPacotesQuerySchema,
  MSG_PACOTE_SEM_ITENS,
  pacoteInputSchema,
  registrarUsoPacoteSchema,
  somarItensPacote,
  statusExibicaoPacote,
} from './pacote';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ITEM = { produtoId: ID, quantidade: 10 };
const VALIDO = { pacienteId: ID, nome: 'Pacote 10 sessões', itens: [ITEM] };

const mensagens = (dados: unknown) =>
  Object.fromEntries(
    (pacoteInputSchema.safeParse(dados).error?.issues ?? []).map((i) => [
      i.path.join('.'),
      i.message,
    ]),
  );

describe('pacoteInputSchema', () => {
  it('exige cliente, nome e itens com a mensagem padrão', () => {
    expect(mensagens({})).toMatchObject({
      pacienteId: 'Cliente é obrigatório.',
      nome: 'Nome do Pacote é obrigatório.',
      itens: MSG_PACOTE_SEM_ITENS,
    });
    expect(mensagens({ ...VALIDO, nome: '   ', itens: [] })).toMatchObject({
      nome: 'Nome do Pacote é obrigatório.',
      itens: MSG_PACOTE_SEM_ITENS,
    });
  });

  it('os demais campos são opcionais e vazios viram null', () => {
    expect(
      pacoteInputSchema.parse({ ...VALIDO, descricao: '', dataInicio: '', observacoes: ' ' }),
    ).toMatchObject({
      descricao: null,
      valorTotal: null,
      dataInicio: null,
      dataVencimento: null,
      profissionalId: null,
      observacoes: null,
    });
  });

  it('valida quantidade, valor e datas', () => {
    expect(
      pacoteInputSchema.safeParse({ ...VALIDO, itens: [{ ...ITEM, quantidade: 0 }] }).success,
    ).toBe(false);
    expect(
      pacoteInputSchema.safeParse({ ...VALIDO, itens: [{ ...ITEM, quantidade: 1.5 }] }).success,
    ).toBe(false);
    expect(pacoteInputSchema.safeParse({ ...VALIDO, valorTotal: -1 }).success).toBe(false);
    expect(pacoteInputSchema.safeParse({ ...VALIDO, dataInicio: '31/12/2026' }).success).toBe(
      false,
    );
    expect(
      mensagens({ ...VALIDO, dataInicio: '2026-02-10', dataVencimento: '2026-02-01' }),
    ).toEqual({
      dataVencimento: 'O vencimento não pode ser anterior ao início',
    });
  });

  it('rejeita campos desconhecidos (preço enviado pelo front)', () => {
    expect(
      pacoteInputSchema.safeParse({ ...VALIDO, itens: [{ ...ITEM, valorUnitario: 1 }] }).success,
    ).toBe(false);
  });
});

describe('registrarUsoPacoteSchema', () => {
  it('profissional é obrigatório e a quantidade padrão é 1', () => {
    expect(registrarUsoPacoteSchema.safeParse({}).error?.issues[0]?.message).toBe(
      'Profissional é obrigatório.',
    );
    expect(registrarUsoPacoteSchema.parse({ profissionalId: ID })).toEqual({
      profissionalId: ID,
      quantidade: 1,
      observacoes: null,
    });
    expect(registrarUsoPacoteSchema.safeParse({ profissionalId: ID, quantidade: 0 }).success).toBe(
      false,
    );
  });
});

describe('somarItensPacote', () => {
  it('soma quantidade x valor arredondando em centavos', () => {
    expect(somarItensPacote([{ quantidade: 3, valorUnitario: 0.1 }])).toBe(0.3);
    expect(
      somarItensPacote([
        { quantidade: 10, valorUnitario: 27.494 },
        { quantidade: 1, valorUnitario: 1 },
      ]),
    ).toBe(275.94);
  });
});

describe('statusExibicaoPacote', () => {
  const base = { gravado: 'ATIVO', saldo: 5, dataVencimento: null } as const;
  const HOJE = '2026-11-12';

  it('Cancelado vence sobre qualquer regra', () => {
    expect(statusExibicaoPacote({ ...base, gravado: 'CANCELADO', saldo: 0 }, HOJE)).toBe(
      'CANCELADO',
    );
  });

  it('Finalizado quando o saldo zera, mesmo vencido', () => {
    expect(statusExibicaoPacote({ ...base, saldo: 0, dataVencimento: '2026-01-01' }, HOJE)).toBe(
      'FINALIZADO',
    );
  });

  it('Vencido só depois da data; no dia ainda é Ativo', () => {
    expect(statusExibicaoPacote({ ...base, dataVencimento: '2026-11-11' }, HOJE)).toBe('VENCIDO');
    expect(statusExibicaoPacote({ ...base, dataVencimento: HOJE }, HOJE)).toBe('ATIVO');
    expect(statusExibicaoPacote(base, HOJE)).toBe('ATIVO');
  });
});

describe('listPacotesQuerySchema', () => {
  it('aceita os chips e a ordenação das colunas do grid', () => {
    expect(listPacotesQuerySchema.parse({}).sort).toEqual({ field: 'criacao', direction: 'desc' });
    for (const status of ['ativo', 'finalizado', 'vencido', 'cancelado']) {
      expect(listPacotesQuerySchema.safeParse({ status }).success).toBe(true);
    }
    for (const sort of ['cliente', 'nome', 'valor', 'vencimento', 'status']) {
      expect(listPacotesQuerySchema.safeParse({ sort: `${sort}:asc` }).success).toBe(true);
    }
    expect(listPacotesQuerySchema.safeParse({ status: 'x' }).success).toBe(false);
    expect(listPacotesQuerySchema.safeParse({ sort: 'x:asc' }).success).toBe(false);
  });
});
