import { createEnvelope, findSensitiveKey, parseEnvelope } from './message-envelope';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('envelope da mensagem', () => {
  it('cria o envelope com eventId, data e versão 1', () => {
    const envelope = createEnvelope('comercial.venda.paga', { vendaId: 'v-1' }, { userId: 'u-1' });

    expect(envelope).toEqual({
      eventId: expect.stringMatching(UUID),
      type: 'comercial.venda.paga',
      occurredAt: expect.any(String),
      userId: 'u-1',
      payload: { vendaId: 'v-1' },
      version: 1,
    });
    expect(new Date(envelope.occurredAt).toISOString()).toBe(envelope.occurredAt);
  });

  it('lê de volta um envelope válido', () => {
    const envelope = createEnvelope(
      'comercial.venda.paga',
      { vendaId: 'v-1' },
      {
        userId: 'u-1',
        version: 2,
      },
    );

    expect(parseEnvelope(Buffer.from(JSON.stringify(envelope)))).toEqual(envelope);
  });

  it.each([
    ['JSON inválido', '{'],
    ['sem eventId', JSON.stringify({ type: 'a.b.c', occurredAt: new Date().toISOString() })],
    [
      'tipo fora do padrão',
      JSON.stringify({
        ...createEnvelope('a.b.c', {}, { userId: 'u' }),
        type: 'invalido',
      }),
    ],
  ])('devolve undefined para %s', (_caso, conteudo) => {
    expect(parseEnvelope(Buffer.from(conteudo))).toBeUndefined();
  });
});

describe('findSensitiveKey', () => {
  it('aceita payload só com ids', () => {
    expect(findSensitiveKey({ pacienteId: 'p-1', itens: [{ produtoId: 'x' }] })).toBeUndefined();
  });

  it('encontra dado pessoal em qualquer nível, sem diferenciar maiúsculas', () => {
    expect(findSensitiveKey({ cpf: '1' })).toBe('cpf');
    expect(findSensitiveKey({ paciente: { Telefone: '1' } })).toBe('paciente.Telefone');
    expect(findSensitiveKey({ itens: [{ id: 1 }, { email: 'x' }] })).toBe('itens[1].email');
  });

  it('ignora valores que não são objetos', () => {
    expect(findSensitiveKey('texto')).toBeUndefined();
    expect(findSensitiveKey(null)).toBeUndefined();
  });
});
