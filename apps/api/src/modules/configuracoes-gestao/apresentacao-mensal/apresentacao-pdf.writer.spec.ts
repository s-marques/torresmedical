import type { ApresentacaoMensal, IndicadorApresentacao } from '@torres/shared';
import {
  escreverApresentacaoPdf,
  formatarValor,
  mesPorExtenso,
  NOMES_INDICADOR,
} from './apresentacao-pdf.writer';

const paginas = (pdf: Buffer): number =>
  (pdf.toString('latin1').match(/\/Type \/Page(?![s\w])/g) ?? []).length;

function indicador(extra: Partial<IndicadorApresentacao> = {}): IndicadorApresentacao {
  return {
    id: 'faturamento',
    numero: 1,
    formato: 'moeda',
    grafico: 'tendencia',
    comparacao: 'MES_ANTERIOR',
    valor: 1500,
    anterior: 1000,
    variacao: 50,
    serie: [
      { rotulo: '2026-09', chave: null, valor: 1000, anterior: null },
      { rotulo: '2026-10', chave: null, valor: 1500, anterior: null },
    ],
    detalhe: [],
    avisos: [],
    ...extra,
  };
}

const relatorio = (indicadores: IndicadorApresentacao[]): ApresentacaoMensal => ({
  mes: '2026-10',
  mesAnterior: '2026-09',
  geradoEm: '2026-11-01T12:00:00.000Z',
  indicadores,
});

describe('apresentacao-pdf.writer', () => {
  it('formata o valor pelo formato e o dado ausente como indisponível', () => {
    expect(formatarValor('moeda', 1234.5)).toContain('1.234,50');
    expect(formatarValor('percentual', 42.55)).toBe('42,6%');
    expect(formatarValor('nps', -10)).toBe('-10');
    expect(formatarValor('numero', 12.345)).toBe('12,345');
    expect(formatarValor('moeda', null)).toBe('Dado indisponível');
  });

  it('escreve o mês por extenso em português', () => {
    expect(mesPorExtenso('2026-10')).toBe('Outubro de 2026');
    expect(mesPorExtenso('2027-01')).toBe('Janeiro de 2027');
  });

  it('tem um nome em português para cada indicador', () => {
    expect(Object.keys(NOMES_INDICADOR)).toHaveLength(10);
  });

  it('gera uma página por indicador, de qualquer tipo de gráfico', async () => {
    const comparativo = indicador({
      id: 'despesas-centro-custo',
      numero: 5,
      grafico: 'comparativo',
      comparacao: 'MEDIA_90_DIAS',
      serie: [
        { rotulo: 'Limpeza', chave: null, valor: 300, anterior: 310 },
        { rotulo: 'Visitas recebidas', chave: 'visitas-recebidas', valor: null, anterior: null },
      ],
      detalhe: [{ rotulo: 'Dr. Fictício', chave: null, valor: 2, anterior: null }],
      avisos: ['VISITAS_RECEBIDAS_INDISPONIVEL'],
    });
    const semDados = indicador({
      id: 'nps-medicos',
      numero: 9,
      formato: 'nps',
      valor: null,
      anterior: null,
      variacao: null,
      serie: [{ rotulo: '2026-10', chave: null, valor: null, anterior: null }],
    });
    const negativo = indicador({
      id: 'nps-pacientes',
      numero: 10,
      formato: 'nps',
      valor: -20,
      serie: [
        { rotulo: '2026-09', chave: null, valor: 40, anterior: null },
        { rotulo: '2026-10', chave: null, valor: -20, anterior: null },
      ],
    });

    const pdf = await escreverApresentacaoPdf(
      relatorio([indicador(), comparativo, semDados, negativo]),
    );

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBe(4);
  });

  it('sem indicadores gera uma página avisando', async () => {
    expect(paginas(await escreverApresentacaoPdf(relatorio([])))).toBe(1);
  });
});
