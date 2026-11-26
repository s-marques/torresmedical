import { Prisma } from '../../../generated/prisma/client';
import {
  agruparPorFaixa,
  diasEmAtraso,
  diasEntre,
  estaVencido,
  marcoDoTitulo,
  saldoEmAberto,
  somar,
  somarDias,
  vencimentoDoMarco,
  type TituloEmAberto,
} from './inadimplencia.regras';

const HOJE = '2026-11-26';
const d = (valor: string) => new Prisma.Decimal(valor);
const titulo = (id: string, vencimento: string, saldo: string): TituloEmAberto => ({
  id,
  vencimento,
  saldo: d(saldo),
});

describe('datas da régua', () => {
  it('conta dias entre datas, atravessando mês e ano', () => {
    expect(diasEntre('2026-11-23', HOJE)).toBe(3);
    expect(diasEntre('2026-12-31', '2027-01-02')).toBe(2);
    expect(diasEntre(HOJE, '2026-11-23')).toBe(-3);
  });

  it('soma dias a uma data', () => {
    expect(somarDias('2026-11-30', 1)).toBe('2026-12-01');
    expect(somarDias('2027-01-01', -1)).toBe('2026-12-31');
  });
});

describe('marcos da régua', () => {
  it('o vencimento de cada marco: 3 dias antes vence daqui a 3 dias', () => {
    expect(vencimentoDoMarco('ANTES_3_DIAS', HOJE)).toBe('2026-11-29');
    expect(vencimentoDoMarco('NO_VENCIMENTO', HOJE)).toBe(HOJE);
    expect(vencimentoDoMarco('DEPOIS_3_DIAS', HOJE)).toBe('2026-11-23');
    expect(vencimentoDoMarco('DEPOIS_7_DIAS', HOJE)).toBe('2026-11-19');
  });

  it('título que vence em 3 dias cai no marco "3 dias antes"; dias fora do marco não cobram', () => {
    expect(marcoDoTitulo('2026-11-29', HOJE)).toBe('ANTES_3_DIAS');
    expect(marcoDoTitulo(HOJE, HOJE)).toBe('NO_VENCIMENTO');
    expect(marcoDoTitulo('2026-11-23', HOJE)).toBe('DEPOIS_3_DIAS');
    expect(marcoDoTitulo('2026-11-19', HOJE)).toBe('DEPOIS_7_DIAS');
    expect(marcoDoTitulo('2026-11-28', HOJE)).toBeNull();
    expect(marcoDoTitulo('2026-11-18', HOJE)).toBeNull();
  });
});

describe('saldo em aberto', () => {
  it('desconta as baixas parciais', () => {
    expect(
      saldoEmAberto(d('1000.00'), [{ valorRecebido: d('250.50') }, { valorRecebido: d('100') }]),
    ).toEqual(d('649.5'));
  });

  it('nunca fica negativo', () => {
    expect(saldoEmAberto(d('100'), [{ valorRecebido: d('130') }]).toString()).toBe('0');
  });
});

describe('vencido e atraso', () => {
  it('vence antes de hoje e tem saldo; o que vence hoje ainda não está vencido', () => {
    expect(estaVencido(titulo('a', '2026-11-25', '10'), HOJE)).toBe(true);
    expect(estaVencido(titulo('b', HOJE, '10'), HOJE)).toBe(false);
    expect(estaVencido(titulo('c', '2026-11-01', '0'), HOJE)).toBe(false);
  });

  it('dias em atraso nunca são negativos', () => {
    expect(diasEmAtraso('2026-11-16', HOJE)).toBe(10);
    expect(diasEmAtraso('2026-12-01', HOJE)).toBe(0);
  });
});

describe('aging', () => {
  it('quebra em 0 a 30, 31 a 60 e mais de 60 dias, somando o saldo', () => {
    const vencidos = [
      titulo('1', '2026-11-25', '100.00'), // 1 dia
      titulo('2', '2026-10-27', '50.25'), // 30 dias
      titulo('3', '2026-10-26', '200.00'), // 31 dias
      titulo('4', '2026-09-27', '10.00'), // 60 dias
      titulo('5', '2026-09-26', '300.00'), // 61 dias
    ];
    const aging = agruparPorFaixa(vencidos, HOJE);
    expect(aging.ATE_30).toEqual({ valor: d('150.25'), quantidade: 2 });
    expect(aging.DE_31_A_60).toEqual({ valor: d('210'), quantidade: 2 });
    expect(aging.ACIMA_60).toEqual({ valor: d('300'), quantidade: 1 });
  });

  it('a soma das faixas fecha com o total dos vencidos', () => {
    const vencidos = [titulo('1', '2026-11-20', '10.10'), titulo('2', '2026-08-01', '20.20')];
    const faixas = Object.values(agruparPorFaixa(vencidos, HOJE));
    expect(faixas.reduce((t, f) => t.add(f.valor), d('0'))).toEqual(somar(vencidos).valor);
  });
});
