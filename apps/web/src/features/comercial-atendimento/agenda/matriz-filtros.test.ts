import { describe, expect, it } from 'vitest';
import { gravarFiltrosMatriz, lerFiltrosMatriz } from './matriz-filtros';

const ID = '00000000-0000-4000-8000-0000000000c1';

describe('lerFiltrosMatriz', () => {
  it('lê os filtros válidos da URL e ignora o modo', () => {
    const params = new URLSearchParams(
      `modo=matriz&visao=mes&data=2026-10-22&profissionalId=${ID}&turno=NOITE&situacao=BLOQUEADO`,
    );
    expect(lerFiltrosMatriz(params)).toEqual({
      visao: 'mes',
      data: '2026-10-22',
      profissionalId: ID,
      turno: 'NOITE',
      situacao: 'BLOQUEADO',
    });
  });

  it('descarta só o parâmetro inválido', () => {
    const params = new URLSearchParams(`visao=ano&data=2026-10-22&salaId=x&turno=TARDE`);
    expect(lerFiltrosMatriz(params)).toEqual({ data: '2026-10-22', turno: 'TARDE' });
  });

  it('URL sem filtros devolve objeto vazio', () => {
    expect(lerFiltrosMatriz(new URLSearchParams('modo=matriz'))).toEqual({});
  });
});

describe('gravarFiltrosMatriz', () => {
  it('grava, troca e remove; a visão semana (padrão) e o valor vazio saem da URL', () => {
    const base = new URLSearchParams('modo=matriz&turno=TARDE&visao=dia');
    const novo = gravarFiltrosMatriz(base, { visao: 'semana', turno: null, salaId: ID });
    expect(novo.toString()).toBe(`modo=matriz&salaId=${ID}`);
    expect(base.get('turno')).toBe('TARDE');
  });
});
