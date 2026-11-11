import { describe, expect, it } from 'vitest';
import { iniciais, quandoDaConversa, textoNaoLidas } from './formatar';

describe('quandoDaConversa', () => {
  const agora = new Date(2026, 9, 15, 18, 0); // qui., 15/10/2026

  it('hoje: hora; ontem: "Ontem"; na semana: dia abreviado; antes: dd/MM', () => {
    expect(quandoDaConversa(new Date(2026, 9, 15, 9, 5), agora)).toBe('09:05');
    expect(quandoDaConversa(new Date(2026, 9, 14, 23, 59), agora)).toBe('Ontem');
    expect(quandoDaConversa(new Date(2026, 9, 10, 8, 0), agora)).toBe('sáb.');
    expect(quandoDaConversa(new Date(2026, 9, 8, 8, 0), agora)).toBe('08/10');
  });
});

describe('iniciais', () => {
  it('primeira letra do primeiro e do último nome', () => {
    expect(iniciais('maria da silva')).toBe('MS');
    expect(iniciais('Ana')).toBe('A');
    expect(iniciais('  ')).toBe('?');
    expect(iniciais(null)).toBe('?');
  });
});

describe('textoNaoLidas', () => {
  it('até 9 mostra o número; acima, 9+', () => {
    expect(textoNaoLidas(9)).toBe('9');
    expect(textoNaoLidas(10)).toBe('9+');
  });
});
