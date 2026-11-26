import {
  agruparProvisao,
  chaveCompetencia,
  mesesDoPeriodo,
  projetarContratos,
  type ContratoProjetavel,
  type LinhaProvisao,
} from './provisao-recebimentos';

const contrato = (extra: Partial<ContratoProjetavel> = {}): ContratoProjetavel => ({
  id: 'c1',
  numero: 7,
  modalidade: 'MENSAL',
  permuta: false,
  valorUnitario: 1160,
  diaVencimento: 10,
  dataInicio: '2026-11-01',
  dataFim: null,
  salaNome: 'Sala 1',
  locatarioTipo: 'PROFISSIONAL',
  locatarioNome: 'Dra. Teste',
  ...extra,
});

const projetar = (
  contratos: ContratoProjetavel[],
  periodo = { de: '2026-11-01', ate: '2027-02-28' },
  cobertas: string[] = [],
  aPartirDe = '2026-11',
) => projetarContratos(contratos, { periodo, aPartirDe, cobertas: new Set(cobertas) });

const vencimentos = (linhas: LinhaProvisao[]) =>
  linhas.map((l) => l.vencimento.toISOString().slice(0, 10));

describe('mesesDoPeriodo', () => {
  it('lista os meses do período, atravessando o ano', () => {
    expect(mesesDoPeriodo('2026-11-15', '2027-02-03')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });
});

describe('projetarContratos', () => {
  it('contrato mensal de R$ 1.160 com vencimento dia 10 gera 10/11, 10/12, 10/01...', () => {
    const linhas = projetar([contrato()]);

    expect(vencimentos(linhas)).toEqual(['2026-11-10', '2026-12-10', '2027-01-10', '2027-02-10']);
    expect(linhas.every((l) => l.valor === 1160 && l.origem === 'Projetado')).toBe(true);
    expect(linhas.reduce((soma, l) => soma + l.valor, 0)).toBe(4640);
  });

  it('para no fim da vigência', () => {
    const linhas = projetar([contrato({ dataFim: '2026-12-20' })]);

    expect(vencimentos(linhas)).toEqual(['2026-11-10', '2026-12-10']);
  });

  it('não projeta permuta, Por Turno nem Hora Avulsa', () => {
    const linhas = projetar([
      contrato({ id: 'a', permuta: true }),
      contrato({ id: 'b', modalidade: 'TURNO' }),
      contrato({ id: 'c', modalidade: 'HORA' }),
    ]);

    expect(linhas).toEqual([]);
  });

  it('pula o mês que já tem cobrança, título ou "sem cobrança"', () => {
    const linhas = projetar([contrato()], undefined, [chaveCompetencia('c1', '2026-12')]);

    expect(vencimentos(linhas)).toEqual(['2026-11-10', '2027-01-10', '2027-02-10']);
  });

  it('ajusta o vencimento ao último dia de meses curtos', () => {
    const linhas = projetar([contrato({ diaVencimento: 31 })]);

    expect(vencimentos(linhas)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
  });

  it('não projeta competências antes do mês atual', () => {
    const linhas = projetar([contrato()], { de: '2026-09-01', ate: '2026-12-31' });

    expect(vencimentos(linhas)).toEqual(['2026-11-10', '2026-12-10']);
  });

  it('só traz parcelas com vencimento dentro do período', () => {
    const linhas = projetar([contrato()], { de: '2026-12-11', ate: '2027-01-09' });

    expect(linhas).toEqual([]);
  });

  it('não projeta antes do início do contrato', () => {
    const linhas = projetar([contrato({ dataInicio: '2027-01-15' })]);

    expect(vencimentos(linhas)).toEqual(['2027-01-10', '2027-02-10']);
  });

  it('o profissional é o locatário; contrato de cliente fica sem profissional', () => {
    const [profissional] = projetar([contrato()]);
    const [cliente] = projetar([
      contrato({ locatarioTipo: 'CLIENTE', locatarioNome: 'Cliente X' }),
    ]);

    expect(profissional?.profissional).toBe('Dra. Teste');
    expect(cliente?.profissional).toBe('Sem profissional');
  });
});

describe('agruparProvisao', () => {
  const base = (extra: Partial<LinhaProvisao>): LinhaProvisao => ({
    origem: 'Gerado',
    mes: '2026-11',
    vencimento: new Date('2026-11-10T00:00:00Z'),
    contrato: 1,
    locatario: 'L',
    profissional: 'P1',
    sala: 'S1',
    modalidade: 'MENSAL',
    valor: 100,
    status: 'Pendente',
    ...extra,
  });
  const linhas = [
    base({}),
    base({ origem: 'Projetado', mes: '2026-12', valor: 100.5, status: 'Projetado' }),
    base({ profissional: 'P2', sala: 'S2', modalidade: 'TURNO', valor: 50 }),
  ];
  const rotulo = (m: string) => `rotulo-${m}`;

  it('soma gerado, projetado e total por mês', () => {
    expect(agruparProvisao(linhas, 'mes', rotulo)).toEqual([
      { grupo: '2026-11', gerado: 150, projetado: 0, total: 150 },
      { grupo: '2026-12', gerado: 0, projetado: 100.5, total: 100.5 },
    ]);
  });

  it('agrupa por profissional, sala, modalidade e status', () => {
    expect(agruparProvisao(linhas, 'profissional', rotulo).map((g) => g.grupo)).toEqual([
      'P1',
      'P2',
    ]);
    expect(agruparProvisao(linhas, 'sala', rotulo).map((g) => g.total)).toEqual([200.5, 50]);
    expect(agruparProvisao(linhas, 'modalidade', rotulo).map((g) => g.grupo)).toEqual([
      'rotulo-MENSAL',
      'rotulo-TURNO',
    ]);
    expect(agruparProvisao(linhas, 'status', rotulo).map((g) => g.grupo)).toEqual([
      'Pendente',
      'Projetado',
    ]);
  });
});
