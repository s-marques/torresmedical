import { hojeNaClinica, PACOTE_EXPORT_DEFINITIONS, toPacote } from './pacotes.service';

type Entrada = Parameters<typeof toPacote>[0];

const decimal = (valor: string) => ({ toString: () => valor });

function pacote(extra: Partial<Entrada> = {}): Entrada {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    pacienteId: '00000000-0000-4000-8000-000000000002',
    nome: 'Pacote',
    descricao: null,
    valorTotal: decimal('300'),
    dataInicio: null,
    dataVencimento: null,
    profissionalId: null,
    observacoes: null,
    sessoesTotal: 5,
    sessoesUsadas: 0,
    status: 'ATIVO',
    createdAt: new Date('2026-11-01T12:00:00Z'),
    updatedAt: new Date('2026-11-01T12:00:00Z'),
    deletedAt: null,
    paciente: { nome: 'Cliente Teste' },
    profissional: null,
    itens: [
      {
        id: 'i1',
        pacoteId: 'p',
        produtoId: 'a',
        descricao: 'A',
        quantidade: 2,
        valorUnitario: decimal('100'),
        posicao: 0,
      },
      {
        id: 'i2',
        pacoteId: 'p',
        produtoId: 'b',
        descricao: 'B',
        quantidade: 3,
        valorUnitario: decimal('50'),
        posicao: 1,
      },
    ],
    usos: [],
    ...extra,
  } as unknown as Entrada;
}

describe('toPacote', () => {
  it('calcula saldo, status e abate os usos dos itens na ordem', () => {
    const dto = toPacote(pacote({ sessoesUsadas: 3 }), '2026-11-12');
    expect(dto).toMatchObject({
      cliente: 'Cliente Teste',
      sessoesTotal: 5,
      saldo: 2,
      status: 'ATIVO',
    });
    expect(dto.itens.map((i) => i.usadas)).toEqual([2, 1]);
  });

  it('Finalizado quando todas as sessões foram usadas', () => {
    const dto = toPacote(pacote({ sessoesUsadas: 5 }), '2026-11-12');
    expect(dto.status).toBe('FINALIZADO');
    expect(dto.itens.map((i) => i.usadas)).toEqual([2, 3]);
  });

  it('Vencido quando a data passou e ainda há saldo; Cancelado é o gravado', () => {
    const vencida = pacote({ dataVencimento: new Date('2026-11-11T00:00:00Z') });
    expect(toPacote(vencida, '2026-11-12')).toMatchObject({
      dataVencimento: '2026-11-11',
      status: 'VENCIDO',
    });
    expect(toPacote(pacote({ status: 'CANCELADO' }), '2026-11-12').status).toBe('CANCELADO');
  });

  it('mapeia o histórico de usos com o profissional', () => {
    const uso = {
      id: 'u1',
      profissionalId: 'prof',
      quantidade: 1,
      observacoes: null,
      createdAt: new Date('2026-11-05T15:00:00Z'),
      profissional: { nome: 'Dra. Teste' },
    };
    const dto = toPacote(pacote({ usos: [uso] as unknown as Entrada['usos'] }), '2026-11-12');
    expect(dto.usos).toEqual([
      {
        id: 'u1',
        profissionalId: 'prof',
        profissional: 'Dra. Teste',
        quantidade: 1,
        observacoes: null,
        data: '2026-11-05T15:00:00.000Z',
      },
    ]);
  });
});

describe('hojeNaClinica', () => {
  it('usa o dia no fuso da clínica, não o de UTC', () => {
    // 01:00 UTC ainda é o dia anterior em São Paulo (UTC-3).
    expect(hojeNaClinica(new Date('2026-11-12T01:00:00Z'))).toBe('2026-11-11');
    expect(hojeNaClinica(new Date('2026-11-12T15:00:00Z'))).toBe('2026-11-12');
  });
});

describe('PACOTE_EXPORT_DEFINITIONS', () => {
  it('exporta as colunas do grid com o rótulo do status', () => {
    const dto = toPacote(pacote({ sessoesUsadas: 2 }), '2026-11-12');
    const valores = Object.fromEntries(PACOTE_EXPORT_DEFINITIONS.map((c) => [c.key, c.value(dto)]));
    expect(valores).toEqual({
      cliente: 'Cliente Teste',
      nome: 'Pacote',
      sessoes: 5,
      saldo: 3,
      valor: '300',
      vencimento: null,
      status: 'Ativo',
    });
  });
});
