import {
  assertQueueName,
  assertRoutingKey,
  dlqOf,
  exchangeOf,
  retryQueueOf,
} from './messaging-names';

describe('nomes da mensageria', () => {
  it.each([
    'comercial.venda.paga',
    'comercial.whatsapp.enviar-mensagem',
    'regulatorio.nfse.emitir',
  ])('aceita a routing key %s', (type) => {
    expect(() => assertRoutingKey(type)).not.toThrow();
  });

  it.each(['comercial.venda', 'Comercial.venda.paga', 'comercial.venda.*', 'a.b.c.d', 'a..b'])(
    'rejeita a routing key %s',
    (type) => {
      expect(() => assertRoutingKey(type)).toThrow('Tipo de mensagem inválido');
    },
  );

  it('valida o nome da fila', () => {
    expect(() => assertQueueName('financeiro.gerar-titulo-venda')).not.toThrow();
    expect(() => assertQueueName('financeiro')).toThrow('Fila inválida');
    expect(() => assertQueueName('financeiro.gerar.titulo')).toThrow('Fila inválida');
  });

  it('usa o exchange do primeiro segmento: módulo publicador (evento) ou destino (comando)', () => {
    expect(exchangeOf('comercial.venda.paga')).toBe('torres.comercial');
    expect(exchangeOf('regulatorio.nfse.emitir')).toBe('torres.regulatorio');
    expect(() => exchangeOf('invalido')).toThrow();
  });

  it('deriva a DLQ e a fila de espera do retry', () => {
    expect(dlqOf('financeiro.gerar-titulo-venda')).toBe('financeiro.gerar-titulo-venda.dlq');
    expect(retryQueueOf('financeiro.gerar-titulo-venda')).toBe(
      'financeiro.gerar-titulo-venda.retry',
    );
  });
});
