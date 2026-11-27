import { describe, expect, it } from 'vitest';
import {
  apresentacaoMensalQuerySchema,
  apresentacaoMensalSchema,
  INDICADORES_APRESENTACAO,
} from './apresentacao-mensal';

describe('apresentacao-mensal', () => {
  it('são os 10 indicadores da reunião mensal (R §27)', () => {
    expect(INDICADORES_APRESENTACAO).toHaveLength(10);
  });

  it.each(['2026-01', '2026-12'])('aceita o mês %s', (mes) => {
    expect(apresentacaoMensalQuerySchema.safeParse({ mes }).success).toBe(true);
  });

  it.each(['', '2026-13', '2026-00', '2026-1', '26-10', '2026-10-01', 'outubro'])(
    'recusa o mês "%s"',
    (mes) => {
      expect(apresentacaoMensalQuerySchema.safeParse({ mes }).success).toBe(false);
    },
  );

  it('exige o mês', () => {
    expect(apresentacaoMensalQuerySchema.safeParse({}).success).toBe(false);
  });

  it('aceita o relatório sem indicadores (usuário sem permissão em nenhum)', () => {
    expect(
      apresentacaoMensalSchema.safeParse({
        mes: '2026-10',
        mesAnterior: '2026-09',
        geradoEm: '2026-11-01T12:00:00.000Z',
        indicadores: [],
      }).success,
    ).toBe(true);
  });
});
