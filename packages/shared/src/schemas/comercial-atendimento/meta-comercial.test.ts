import { describe, expect, it } from 'vitest';
import {
  acompanhamentoMetasQuerySchema,
  intervaloDaMeta,
  listMetasComerciaisQuerySchema,
  metaComercialInputSchema,
  percentualAtingido,
} from './meta-comercial';

const valida = {
  metrica: 'LEADS',
  periodoTipo: 'MES',
  periodo: '2026-11',
  valor: 40,
};

describe('metaComercialInputSchema', () => {
  it('aceita a meta mínima e normaliza responsável e observações', () => {
    const r = metaComercialInputSchema.parse(valida);
    expect(r.responsavelId).toBeNull();
    expect(r.observacoes).toBeNull();
  });

  it('aceita responsável vazio do formulário como equipe toda', () => {
    expect(
      metaComercialInputSchema.parse({ ...valida, responsavelId: '' }).responsavelId,
    ).toBeNull();
    expect(
      metaComercialInputSchema.parse({ ...valida, responsavelId: null }).responsavelId,
    ).toBeNull();
    expect(metaComercialInputSchema.safeParse({ ...valida, responsavelId: 'x' }).success).toBe(
      false,
    );
  });

  it('aceita trimestre e responsável', () => {
    const r = metaComercialInputSchema.parse({
      ...valida,
      periodoTipo: 'TRIMESTRE',
      periodo: '2026-T4',
      responsavelId: '6f1c1c0e-3c0e-4b8e-9b0a-0d3f6a1c9a11',
      observacoes: '  foco em visitas ',
    });
    expect(r.observacoes).toBe('foco em visitas');
  });

  it.each([
    ['mês fora do tipo', { periodoTipo: 'MES', periodo: '2026-T4' }],
    ['trimestre fora do tipo', { periodoTipo: 'TRIMESTRE', periodo: '2026-11' }],
    ['mês 13', { periodoTipo: 'MES', periodo: '2026-13' }],
    ['trimestre 5', { periodoTipo: 'TRIMESTRE', periodo: '2026-T5' }],
  ])('rejeita período inválido: %s', (_nome, extra) => {
    const r = metaComercialInputSchema.safeParse({ ...valida, ...extra });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['periodo']);
  });

  it('exige período e valor, e recusa valor negativo ou métrica desconhecida', () => {
    const vazio = metaComercialInputSchema.safeParse({ ...valida, periodo: '', valor: undefined });
    const mensagens = vazio.error?.issues.map((i) => i.message);
    expect(mensagens).toContain('Período é obrigatório.');
    expect(mensagens).toContain('Valor é obrigatório.');
    expect(metaComercialInputSchema.safeParse({ ...valida, valor: -1 }).success).toBe(false);
    expect(metaComercialInputSchema.safeParse({ ...valida, metrica: 'X' }).success).toBe(false);
  });
});

describe('intervaloDaMeta', () => {
  it('calcula mês (inclusive fevereiro bissexto) e trimestre', () => {
    expect(intervaloDaMeta('MES', '2026-11')).toEqual({ inicio: '2026-11-01', fim: '2026-11-30' });
    expect(intervaloDaMeta('MES', '2028-02')).toEqual({ inicio: '2028-02-01', fim: '2028-02-29' });
    expect(intervaloDaMeta('TRIMESTRE', '2026-T1')).toEqual({
      inicio: '2026-01-01',
      fim: '2026-03-31',
    });
    expect(intervaloDaMeta('TRIMESTRE', '2026-T4')).toEqual({
      inicio: '2026-10-01',
      fim: '2026-12-31',
    });
    expect(intervaloDaMeta('MES', 'abc')).toBeNull();
  });
});

describe('percentualAtingido', () => {
  it('arredonda a 1 casa e devolve null sem meta', () => {
    expect(percentualAtingido(25, 40)).toBe(62.5);
    expect(percentualAtingido(1, 3)).toBe(33.3);
    expect(percentualAtingido(50, 40)).toBe(125);
    expect(percentualAtingido(5, 0)).toBeNull();
  });
});

describe('queries', () => {
  it('listagem tem ordenação padrão e filtros opcionais', () => {
    const q = listMetasComerciaisQuerySchema.parse({ metrica: 'VISITAS', de: '2026-01-01' });
    expect(q.sort).toEqual({ field: 'dataInicio', direction: 'desc' });
    expect(q.de).toBe('2026-01-01');
    expect(listMetasComerciaisQuerySchema.safeParse({ metrica: 'X' }).success).toBe(false);
  });

  it('acompanhamento aceita sem filtros e vazio vira ausente', () => {
    expect(acompanhamentoMetasQuerySchema.parse({ de: '' }).de).toBeUndefined();
  });
});
