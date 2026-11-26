import { describe, expect, it } from 'vitest';
import {
  contaComBaixaCancelavel,
  contaComSaldoEmAberto,
  diferencaEmCentavos,
} from './regras-conta-receber';

describe('regras de Contas a Receber', () => {
  it('só A vencer e Parcial têm saldo em aberto para baixar ou renegociar', () => {
    expect(contaComSaldoEmAberto({ status: 'PENDENTE' })).toBe(true);
    expect(contaComSaldoEmAberto({ status: 'PARCIAL' })).toBe(true);
    for (const status of ['RECEBIDO', 'CANCELADO', 'RENEGOCIADO'] as const) {
      expect(contaComSaldoEmAberto({ status })).toBe(false);
    }
  });

  it('a baixa só é cancelável com valor recebido e fora de Cancelado e Renegociado', () => {
    expect(contaComBaixaCancelavel({ status: 'PARCIAL', valorRecebido: '10.00' })).toBe(true);
    expect(contaComBaixaCancelavel({ status: 'RECEBIDO', valorRecebido: '100.00' })).toBe(true);
    expect(contaComBaixaCancelavel({ status: 'PENDENTE', valorRecebido: '0.00' })).toBe(false);
    expect(contaComBaixaCancelavel({ status: 'CANCELADO', valorRecebido: '10.00' })).toBe(false);
    expect(contaComBaixaCancelavel({ status: 'RENEGOCIADO', valorRecebido: '10.00' })).toBe(false);
  });

  it('diferencaEmCentavos compara saldo e parcelas sem erro de ponto flutuante', () => {
    expect(diferencaEmCentavos(1000, [600, 400])).toBe(0);
    expect(diferencaEmCentavos(0.3, [0.1, 0.2])).toBe(0);
    expect(diferencaEmCentavos(1000, [700])).toBe(30000);
    expect(diferencaEmCentavos(1000, [700, 400.5])).toBe(-10050);
    expect(diferencaEmCentavos(100, [null, undefined, ''])).toBe(10000);
  });
});
