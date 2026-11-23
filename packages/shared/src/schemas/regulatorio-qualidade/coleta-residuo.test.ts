import { describe, expect, it } from 'vitest';
import { createColetaResiduoSchema } from './coleta-residuo';

const BASE = { dataColeta: '2026-11-10', tipoResiduo: 'INFECTANTE' };

describe('createColetaResiduoSchema', () => {
  it('só Data Coleta e Tipo Resíduo são obrigatórios; o resto vira null', () => {
    expect(createColetaResiduoSchema.parse(BASE)).toEqual({
      ...BASE,
      proximaColeta: null,
      empresaColetora: null,
      manifestoMtr: null,
      pesoKg: null,
      responsavel: null,
      observacoes: null,
    });
  });

  it('vazios usam a mensagem padrão de obrigatório', () => {
    for (const corpo of [{}, { dataColeta: '', tipoResiduo: '' }]) {
      const erros = createColetaResiduoSchema.safeParse(corpo).error?.issues.map((i) => i.message);
      expect(erros).toEqual(
        expect.arrayContaining(['Data Coleta é obrigatória.', 'Tipo Resíduo é obrigatório.']),
      );
    }
  });

  it('aceita os três tipos do print e rejeita outros', () => {
    for (const tipoResiduo of ['INFECTANTE', 'PERFUROCORTANTE', 'QUIMICO']) {
      expect(createColetaResiduoSchema.parse({ ...BASE, tipoResiduo }).tipoResiduo).toBe(
        tipoResiduo,
      );
    }
    expect(createColetaResiduoSchema.safeParse({ ...BASE, tipoResiduo: 'COMUM' }).success).toBe(
      false,
    );
  });

  it('próxima coleta aceita data ISO ou vazio e rejeita data inexistente', () => {
    const proxima = (valor: unknown) =>
      createColetaResiduoSchema.parse({ ...BASE, proximaColeta: valor }).proximaColeta;
    expect(proxima('2026-12-10')).toBe('2026-12-10');
    expect(proxima('')).toBeNull();
    expect(proxima(null)).toBeNull();
    expect(
      createColetaResiduoSchema.safeParse({ ...BASE, proximaColeta: '2026-02-31' }).success,
    ).toBe(false);
  });

  it('peso aceita zero e decimais e rejeita negativo ou acima do limite', () => {
    const peso = (valor: unknown) =>
      createColetaResiduoSchema.safeParse({ ...BASE, pesoKg: valor });
    expect(peso(0).data?.pesoKg).toBe(0);
    expect(peso(12.75).data?.pesoKg).toBe(12.75);
    expect(peso(null).data?.pesoKg).toBeNull();
    expect(peso(-1).success).toBe(false);
    expect(peso(100_000_000).success).toBe(false);
  });

  it('textos: aparam espaços, vazio vira null e o limite é validado', () => {
    const ok = createColetaResiduoSchema.parse({
      ...BASE,
      empresaColetora: '  Coleta Teste ',
      manifestoMtr: '   ',
    });
    expect(ok).toMatchObject({ empresaColetora: 'Coleta Teste', manifestoMtr: null });
    const erro = createColetaResiduoSchema.safeParse({ ...BASE, manifestoMtr: 'x'.repeat(101) });
    expect(erro.error?.issues[0]?.message).toBe('Manifesto MTR deve ter no máximo 100 caracteres');
  });

  it('rejeita campos fora do contrato', () => {
    expect(createColetaResiduoSchema.safeParse({ ...BASE, status: 'X' }).success).toBe(false);
  });
});
