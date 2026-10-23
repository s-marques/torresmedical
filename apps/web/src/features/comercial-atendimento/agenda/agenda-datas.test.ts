import type { Agendamento } from '@torres/shared';
import { describe, expect, it } from 'vitest';
import {
  diasDoPeriodo,
  faixaDeHoras,
  inicioDaSemana,
  periodoDaVisao,
  posicionar,
  rotuloDoDia,
  somarDias,
  tituloDoPeriodo,
} from './agenda-datas';

const em = (dia: number, hora: number, minuto = 0) =>
  new Date(2026, 9, dia, hora, minuto).toISOString();

function ag(numero: number, inicio: string, duracaoMinutos: number): Agendamento {
  return { numero, inicio, duracaoMinutos } as Agendamento;
}

describe('semana e período', () => {
  it('a semana começa na segunda e termina no domingo', () => {
    expect(inicioDaSemana('2026-10-22')).toBe('2026-10-19'); // quinta
    expect(inicioDaSemana('2026-10-25')).toBe('2026-10-19'); // domingo
    expect(inicioDaSemana('2026-10-19')).toBe('2026-10-19'); // segunda
    expect(periodoDaVisao('2026-10-22', 'semana')).toEqual({
      inicio: '2026-10-19',
      fim: '2026-10-25',
    });
    expect(periodoDaVisao('2026-10-22', 'dia')).toEqual({
      inicio: '2026-10-22',
      fim: '2026-10-22',
    });
  });

  it('soma dias atravessando mês e ano', () => {
    expect(somarDias('2026-10-30', 3)).toBe('2026-11-02');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('lista os 7 dias da semana', () => {
    const dias = diasDoPeriodo({ inicio: '2026-10-26', fim: '2026-11-01' });
    expect(dias).toHaveLength(7);
    expect(dias[0]).toBe('2026-10-26');
    expect(dias[6]).toBe('2026-11-01');
  });

  it('formata os títulos como no inventário', () => {
    expect(tituloDoPeriodo({ inicio: '2026-10-12', fim: '2026-10-18' }, 'semana')).toBe(
      '12 de out. — 18 de out. de 2026',
    );
    expect(tituloDoPeriodo({ inicio: '2026-10-22', fim: '2026-10-22' }, 'dia')).toBe(
      '22 de outubro de 2026',
    );
    expect(rotuloDoDia('2026-10-22')).toBe('Quinta, 22 de out.');
  });
});

describe('faixaDeHoras', () => {
  it('usa 07:00 a 20:00 por padrão e se expande para o que estiver fora', () => {
    expect(faixaDeHoras([])).toEqual([7, 20]);
    expect(faixaDeHoras([ag(1, em(22, 9), 60)])).toEqual([7, 20]);
    expect(faixaDeHoras([ag(1, em(22, 6, 30), 30), ag(2, em(22, 21), 90)])).toEqual([6, 22]);
  });
});

describe('posicionar', () => {
  it('sem sobreposição, cada agendamento ocupa a largura toda', () => {
    const itens = posicionar([ag(1, em(22, 8), 60), ag(2, em(22, 9), 60)]);
    expect(itens.map((i) => [i.agendamento.numero, i.faixa, i.faixas])).toEqual([
      [1, 0, 1],
      [2, 0, 1],
    ]);
  });

  it('sobrepostos ficam em faixas diferentes e a faixa livre é reaproveitada', () => {
    const itens = posicionar([
      ag(1, em(22, 9), 120), // 09:00-11:00
      ag(2, em(22, 9, 30), 30), // 09:30-10:00
      ag(3, em(22, 10), 30), // 10:00-10:30 reaproveita a faixa do 2
      ag(4, em(22, 13), 30), // outro grupo
    ]);
    expect(itens.map((i) => [i.agendamento.numero, i.faixa, i.faixas])).toEqual([
      [1, 0, 2],
      [2, 1, 2],
      [3, 1, 2],
      [4, 0, 1],
    ]);
  });
});
