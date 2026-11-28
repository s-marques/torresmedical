import type { Permissao } from '@torres/shared';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import {
  ApresentacaoMensalService,
  LIMITE_RANKING,
  somarMesesDe,
  variacaoDe,
} from './apresentacao-mensal.service';

describe('somarMesesDe', () => {
  it.each([
    ['2026-10', 1, '2026-11'],
    ['2026-12', 1, '2027-01'],
    ['2026-01', -1, '2025-12'],
    ['2026-10', -5, '2026-05'],
    ['2026-03', 0, '2026-03'],
  ])('%s %i → %s', (mes, n, esperado) => {
    expect(somarMesesDe(mes, n)).toBe(esperado);
  });
});

describe('variacaoDe', () => {
  it('moeda e número: variação percentual', () => {
    expect(variacaoDe('moeda', 1500, 1000)).toBe(50);
    expect(variacaoDe('numero', 1, 3)).toBe(-66.7);
  });

  it('percentual e NPS: diferença em pontos', () => {
    expect(variacaoDe('percentual', 62.5, 50)).toBe(12.5);
    expect(variacaoDe('nps', 50, 100)).toBe(-50);
  });

  it('sem base de cálculo não há variação', () => {
    expect(variacaoDe('moeda', 100, 0)).toBeNull();
    expect(variacaoDe('moeda', null, 100)).toBeNull();
    expect(variacaoDe('moeda', 100, null)).toBeNull();
    expect(variacaoDe('nps', null, 50)).toBeNull();
  });

  it('crescer a partir de zero em pontos tem variação', () => {
    expect(variacaoDe('percentual', 10, 0)).toBe(10);
  });
});

describe('ApresentacaoMensalService', () => {
  const PERMISSOES_FINANCEIRO: ReadonlySet<Permissao> = new Set(['financeiro.contas-pagar.ver']);

  function criar(escopo = escopoFalso()) {
    const financeiro = {
      linhasCentroCusto: jest.fn(),
      linhasReceitaTotal: jest.fn(),
      linhasProvisaoResumo: jest.fn(),
    };
    const servico = new ApresentacaoMensalService(
      escopo,
      financeiro as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { servico, financeiro };
  }

  it('perfil restrito a profissionais recebe 403, sem consultar nada', async () => {
    const { servico, financeiro } = criar(escopoFalso(['id-de-um-profissional']));

    await expect(
      servico.gerar('2026-10', { permissoes: PERMISSOES_FINANCEIRO }),
    ).rejects.toMatchObject({ status: 403 });
    expect(financeiro.linhasCentroCusto).not.toHaveBeenCalled();
  });

  it('só monta os indicadores das permissões do usuário', async () => {
    const { servico, financeiro } = criar();
    financeiro.linhasCentroCusto.mockResolvedValue([]);

    const resultado = await servico.gerar('2026-10', { permissoes: PERMISSOES_FINANCEIRO });

    expect(resultado.indicadores.map((i) => i.id)).toEqual(['despesas-centro-custo']);
    expect(resultado.mes).toBe('2026-10');
    expect(resultado.mesAnterior).toBe('2026-09');
    expect(financeiro.linhasReceitaTotal).not.toHaveBeenCalled();
  });

  it('despesas: o maior centro primeiro e o excesso acima do limite soma em "Outros"', async () => {
    const { servico, financeiro } = criar();
    const centros = Array.from({ length: LIMITE_RANKING + 2 }, (_, i) => ({
      centroCusto: `Centro ${i + 1}`,
      valor: 100 - i,
      mediaPeriodo: 10,
      variacao: null,
    }));
    financeiro.linhasCentroCusto.mockResolvedValue([...centros].reverse());

    const { indicadores } = await servico.gerar('2026-10', { permissoes: PERMISSOES_FINANCEIRO });
    const despesas = indicadores[0];

    expect(despesas?.serie).toHaveLength(LIMITE_RANKING + 1);
    expect(despesas?.serie[0]).toMatchObject({ rotulo: 'Centro 1', valor: 100 });
    expect(despesas?.serie.at(-1)).toEqual({
      rotulo: 'Outros',
      chave: 'outros',
      valor: 90 + 89,
      anterior: 20,
    });
    // O total considera todos os centros, não só os exibidos.
    expect(despesas?.valor).toBe(centros.reduce((t, c) => t + c.valor, 0));
    expect(despesas?.anterior).toBe(120);
  });
});
