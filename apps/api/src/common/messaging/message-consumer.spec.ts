import { assertConsumerOptions } from './message-consumer';

describe('assertConsumerOptions', () => {
  it('aceita fila e eventos no padrão', () => {
    expect(() =>
      assertConsumerOptions({
        queue: 'financeiro.gerar-titulo-venda',
        events: ['comercial.venda.paga'],
      }),
    ).not.toThrow();
  });

  it('exige ao menos um evento', () => {
    expect(() => assertConsumerOptions({ queue: 'financeiro.titulos', events: [] })).toThrow(
      'ao menos um evento',
    );
  });

  it('rejeita fila ou evento fora do padrão', () => {
    expect(() => assertConsumerOptions({ queue: 'fila', events: ['a.b.c'] })).toThrow();
    expect(() => assertConsumerOptions({ queue: 'a.b', events: ['a.b'] })).toThrow();
  });
});
