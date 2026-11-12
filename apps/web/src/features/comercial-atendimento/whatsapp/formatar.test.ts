import { describe, expect, it } from 'vitest';
import {
  formatarDuracao,
  horaDaMensagem,
  iniciais,
  legendaDoAutor,
  quandoDaConversa,
  rotuloDoDia,
  textoNaoLidas,
} from './formatar';

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

describe('painel da conversa', () => {
  it('horário do balão, separador de dia e duração', () => {
    const agora = new Date(2026, 9, 15, 18, 0);
    expect(horaDaMensagem(new Date(2026, 9, 15, 8, 5))).toBe('08:05');
    expect(rotuloDoDia(new Date(2026, 9, 15, 0, 1), agora)).toBe('Hoje');
    expect(rotuloDoDia(new Date(2026, 8, 25, 14, 42), agora)).toBe('25/09/2026');
    expect(formatarDuracao(47)).toBe('0:47');
    expect(formatarDuracao(125)).toBe('2:05');
  });
  it('legenda do autor: cliente, nome do atendente e rótulos fixos', () => {
    expect(legendaDoAutor('CLIENTE', null)).toBe('Cliente');
    expect(legendaDoAutor('ATENDENTE', 'Maria')).toBe('Maria');
    expect(legendaDoAutor('ATENDENTE', null)).toBe('Atendente');
    expect(legendaDoAutor('ASSISTENTE_VIRTUAL', null)).toBe('Assistente Virtual');
    expect(legendaDoAutor('CELULAR', null)).toBe('Enviado pelo celular');
  });
});
