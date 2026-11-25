import { describe, expect, it } from 'vitest';
import {
  colunasDoRelatorio,
  filtrosDoRelatorio,
  formatarValorRelatorio,
  rodapeDoRelatorio,
} from './colunas-relatorio';
import { aplicarSelecao, dataLocal, periodoPadrao } from './use-selecao-relatorio';

describe('formatarValorRelatorio', () => {
  it.each([
    ['number', 1234.5, '1.234,5'],
    ['currency', '10.5', 'R$ 10,50'],
    ['date', '2026-10-01', '01/10/2026'],
    ['boolean', true, 'Sim'],
    ['boolean', false, 'Não'],
    ['text', 7, '7'],
  ] as const)('%s %s → %s', (tipo, valor, esperado) => {
    expect(formatarValorRelatorio(tipo, valor).replaceAll(' ', ' ')).toBe(esperado);
  });

  it('vazio vira "-"', () => {
    expect([null, undefined, ''].map((valor) => formatarValorRelatorio('text', valor))).toEqual([
      '-',
      '-',
      '-',
    ]);
  });
});

describe('colunasDoRelatorio', () => {
  it('todas exportáveis; números alinhados à direita', () => {
    const colunas = colunasDoRelatorio({
      id: 'X-01',
      nome: 'X',
      colunas: [
        { id: 'nome', titulo: 'Nome', tipo: 'text', ordenavel: true },
        { id: 'valor', titulo: 'Valor', tipo: 'currency', ordenavel: false },
      ],
      filtros: [],
    });

    expect(
      colunas.map(({ id, ordenavel, exportavel, className }) => [
        id,
        ordenavel,
        exportavel,
        className,
      ]),
    ).toEqual([
      ['nome', true, true, undefined],
      ['valor', false, true, 'text-right tabular-nums'],
    ]);
    expect(colunas[1]?.celula?.({ valor: '2' })).toMatch(/^R\$\s2,00$/);
  });
});

describe('filtrosDoRelatorio e rodapeDoRelatorio', () => {
  const relatorio = {
    id: 'X-01',
    nome: 'X',
    colunas: [
      { id: 'nome', titulo: 'Nome', tipo: 'text' as const, ordenavel: true },
      { id: 'valor', titulo: 'Valor', tipo: 'currency' as const, ordenavel: false },
    ],
    filtros: [
      { tipo: 'select' as const, parametro: 'status', rotulo: 'Status', opcoes: [] },
      {
        tipo: 'entidade' as const,
        parametro: 'profissionalId',
        rotulo: 'Profissional',
        entidade: 'profissionais' as const,
      },
    ],
  };

  it('filtro de entidade ganha o texto "Todos"; select segue igual', () => {
    const filtros = filtrosDoRelatorio(relatorio, 'Todos');

    expect(filtros[0]).toEqual(relatorio.filtros[0]);
    expect(filtros[1]).toEqual({ ...relatorio.filtros[1], rotuloTodos: 'Todos' });
  });

  it('rodapé formata os totais pelo tipo da coluna', () => {
    const rodape = rodapeDoRelatorio(relatorio, 'Total');

    expect(rodape?.rotulo).toBe('Total');
    expect(String(rodape?.celulas({ valor: '10.5' }).valor).replaceAll(/\s/g, ' ')).toBe(
      'R$ 10,50',
    );
  });
});

describe('período padrão', () => {
  it('últimos 30 dias até hoje, em data local', () => {
    expect(periodoPadrao(new Date(2026, 2, 15, 23, 30))).toEqual({
      de: '2026-02-13',
      ate: '2026-03-15',
    });
    expect(dataLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('aplicarSelecao', () => {
  const periodo = { de: '2026-10-01', ate: '2026-10-31' };

  it('mesmo relatório e período: mantém a URL (inclusive a página)', () => {
    const atuais = new URLSearchParams({ relatorio: 'A', ...periodo, page: '3' });

    expect(aplicarSelecao(atuais, { relatorio: 'A', ...periodo })).toBe(atuais);
  });

  it('novo período: mantém ordenação e filtros, volta à página 1', () => {
    const atuais = new URLSearchParams({ relatorio: 'A', ...periodo, page: '3', sort: 'x:asc' });

    const proximo = aplicarSelecao(atuais, { relatorio: 'A', de: '2026-09-01', ate: '2026-10-31' });

    expect(Object.fromEntries(proximo)).toEqual({
      relatorio: 'A',
      de: '2026-09-01',
      ate: '2026-10-31',
      sort: 'x:asc',
    });
  });

  it('outro relatório (ou nenhum): descarta os parâmetros do anterior', () => {
    const atuais = new URLSearchParams({ relatorio: 'A', ...periodo, sort: 'x:asc', status: 'y' });

    expect(Object.fromEntries(aplicarSelecao(atuais, { relatorio: 'B', ...periodo }))).toEqual({
      relatorio: 'B',
      ...periodo,
    });
    expect(Object.fromEntries(aplicarSelecao(atuais, { relatorio: '', ...periodo }))).toEqual(
      periodo,
    );
  });
});
