import { describe, expect, it } from 'vitest';
import { dashboardPainelSchema, filtrosPainelSchema, PERIODO_PAINEL_INVALIDO } from './dashboard';

function erros(entrada: unknown): Record<string, string> {
  const resultado = filtrosPainelSchema.safeParse(entrada);
  if (resultado.success) return {};
  return Object.fromEntries(resultado.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('filtrosPainelSchema', () => {
  it('assume mês e recebimento quando nada é informado', () => {
    expect(filtrosPainelSchema.parse({})).toEqual({ modo: 'mes', base: 'recebimento' });
  });

  it('aceita o mês AAAA-MM e trata vazio como mês atual', () => {
    expect(filtrosPainelSchema.parse({ mes: '2026-10' }).mes).toBe('2026-10');
    expect(filtrosPainelSchema.parse({ mes: '' }).mes).toBeUndefined();
  });

  it('rejeita mês, modo e base inválidos', () => {
    expect(erros({ mes: '2026-13' }).mes).toBe('Mês inválido');
    expect(erros({ modo: 'ano' }).modo).toBe('Modo de período inválido');
    expect(erros({ base: 'caixa' }).base).toBe('Base inválida');
  });

  it('por período exige De e Até', () => {
    expect(erros({ modo: 'periodo' })).toEqual({
      de: 'Informe a data inicial',
      ate: 'Informe a data final',
    });
  });

  it('por período rejeita data inexistente e De maior que Até', () => {
    expect(erros({ modo: 'periodo', de: '2026-02-30', ate: '2026-03-01' }).de).toBe(
      'Data inicial inválida',
    );
    expect(erros({ modo: 'periodo', de: '2026-10-20', ate: '2026-10-10' }).ate).toBe(
      PERIODO_PAINEL_INVALIDO,
    );
  });

  it('por período aceita De igual a Até', () => {
    expect(erros({ modo: 'periodo', de: '2026-10-10', ate: '2026-10-10' })).toEqual({});
  });

  it('em modo mês ignora De e Até', () => {
    expect(erros({ modo: 'mes', de: 'lixo' })).toEqual({});
  });
});

describe('dashboardPainelSchema', () => {
  it('valida os quatro tipos de bloco', () => {
    const dashboard = {
      aba: 'executivo',
      periodo: { de: '2026-10-01', ate: '2026-10-31' },
      base: 'recebimento',
      secoes: [
        {
          id: 's',
          titulo: null,
          blocos: [
            { tipo: 'kpi', id: 'k', rotulo: 'K', valor: 1, formato: 'inteiro', detalhe: null },
            {
              tipo: 'tabela',
              id: 't',
              titulo: 'T',
              colunas: [{ chave: 'a', rotulo: 'A', formato: 'texto' }],
              linhas: [{ a: 'x' }],
              visualizacoes: ['tabela'],
              padrao: 'tabela',
              largura: 'cheia',
            },
            { tipo: 'alerta', id: 'a', titulo: 'A', descricao: 'd', itens: [] },
            { tipo: 'meta-vs-atual', id: 'm', titulo: 'M', indicadores: [] },
          ],
        },
      ],
    };
    expect(dashboardPainelSchema.safeParse(dashboard).success).toBe(true);
    expect(dashboardPainelSchema.safeParse({ ...dashboard, aba: 'outra' }).success).toBe(false);
  });
});
