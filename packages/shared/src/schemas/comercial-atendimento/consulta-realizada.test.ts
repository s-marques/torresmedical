import { describe, expect, it } from 'vitest';
import {
  exportConsultasRealizadasQuerySchema,
  listConsultasRealizadasQuerySchema,
  totaisConsultasRealizadasQuerySchema,
} from './consulta-realizada';
import { intervaloDoPeriodo, PERIODO_CONSULTA_INVALIDO } from './periodo-vendas';

describe('listConsultasRealizadasQuerySchema', () => {
  it('período e pagamento são opcionais; ordena por data decrescente', () => {
    const r = listConsultasRealizadasQuerySchema.parse({});
    expect(r).toMatchObject({ page: 1, sort: { field: 'data', direction: 'desc' } });
    expect(r.de).toBeUndefined();
  });

  it('aceita período e pagamento', () => {
    const r = listConsultasRealizadasQuerySchema.parse({
      de: '2026-10-01',
      ate: '2026-10-30',
      pagamento: 'pago',
    });
    expect(r).toMatchObject({ de: '2026-10-01', ate: '2026-10-30', pagamento: 'pago' });
  });

  it('vazio vira ausente', () => {
    expect(listConsultasRealizadasQuerySchema.parse({ de: '', ate: '' }).de).toBeUndefined();
  });

  it('rejeita data inexistente, período invertido e pagamento inválido', () => {
    expect(listConsultasRealizadasQuerySchema.safeParse({ de: '2026-02-31' }).success).toBe(false);
    const invertido = listConsultasRealizadasQuerySchema.safeParse({
      de: '2026-10-30',
      ate: '2026-10-01',
    });
    expect(invertido.error?.issues[0]).toMatchObject({
      message: PERIODO_CONSULTA_INVALIDO,
      path: ['ate'],
    });
    expect(listConsultasRealizadasQuerySchema.safeParse({ pagamento: 'x' }).success).toBe(false);
  });
});

describe('totaisConsultasRealizadasQuerySchema', () => {
  it('usa os mesmos filtros, sem paginação', () => {
    expect(totaisConsultasRealizadasQuerySchema.parse({ pagamento: 'pendente' })).toEqual({
      pagamento: 'pendente',
    });
  });
});

describe('exportConsultasRealizadasQuerySchema', () => {
  it('mantém os filtros e exige o formato', () => {
    expect(exportConsultasRealizadasQuerySchema.safeParse({}).success).toBe(false);
    const r = exportConsultasRealizadasQuerySchema.parse({ format: 'pdf', pagamento: 'pago' });
    expect(r).toMatchObject({ pagamento: 'pago', columns: expect.any(Array) });
  });
});

describe('intervaloDoPeriodo', () => {
  it('cobre o dia inteiro no fuso da clínica', () => {
    const { inicio, fim } = intervaloDoPeriodo('2026-10-01', '2026-10-30');
    expect(inicio?.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(fim?.toISOString()).toBe('2026-10-31T03:00:00.000Z');
  });

  it('sem datas não limita', () => {
    expect(intervaloDoPeriodo(undefined, undefined)).toEqual({});
  });
});
