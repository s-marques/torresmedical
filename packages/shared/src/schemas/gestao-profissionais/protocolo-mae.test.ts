import { describe, expect, it } from 'vitest';
import { createProtocoloMaeSchema } from './protocolo-mae';

const PROTOCOLO = '00000000-0000-4000-8000-0000000000c1';

describe('createProtocoloMaeSchema', () => {
  it('aplica os padrões e normaliza as semanas', () => {
    expect(
      createProtocoloMaeSchema.parse({
        nome: ' Facial ',
        semanas: [{ semana: 1, protocoloId: null, observacoes: '' }],
      }),
    ).toEqual({
      nome: 'Facial',
      categoria: 'Geral',
      totalSemanas: 1,
      valorTotal: 0,
      descricao: null,
      semanas: [{ semana: 1, protocoloId: null, observacoes: null }],
    });
  });

  it('nome é obrigatório', () => {
    const resultado = createProtocoloMaeSchema.safeParse({ nome: '' });
    expect(resultado.error?.issues.map((i) => [i.path[0], i.message])).toEqual([
      ['nome', 'Nome é obrigatório.'],
    ]);
  });

  it('recusa semana acima do total e semana repetida', () => {
    const resultado = createProtocoloMaeSchema.safeParse({
      nome: 'X',
      totalSemanas: 2,
      semanas: [
        { semana: 1, protocoloId: PROTOCOLO },
        { semana: 1, protocoloId: PROTOCOLO },
        { semana: 3 },
      ],
    });
    expect(resultado.error?.issues.map((i) => i.message)).toEqual([
      'Semana repetida',
      'A semana excede o total de semanas',
    ]);
  });
});
