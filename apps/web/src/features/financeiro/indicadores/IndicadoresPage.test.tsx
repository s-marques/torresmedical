import { PERMISSOES, type IndicadorFinanceiro, type IndicadoresFinanceiros } from '@torres/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/financeiro/indicadores';

function card(
  id: string,
  secao: IndicadorFinanceiro['secao'],
  formato: IndicadorFinanceiro['formato'],
  valor: number | null,
  anterior: number | null,
  variacao: number | null,
): IndicadorFinanceiro {
  return { id, secao, formato, valor, anterior, variacao, detalhe: null };
}

const DADOS: IndicadoresFinanceiros = {
  mes: '2026-10',
  mesAnterior: '2026-09',
  indicadores: [
    card('faturamento-total', 'receitas', 'moeda', 9070, 13650, -33.6),
    card('receita-recorrente', 'receitas', 'moeda', 7910, 7910, 0),
    card('receita-avulsa', 'receitas', 'moeda', 1160, 5740, -79.8),
    card('resultado-operacional', 'receitas', 'moeda', 2091.75, null, null),
    card('taxa-ocupacao', 'ocupacao-salas', 'percentual', null, null, null),
    card('vacancia', 'ocupacao-salas', 'percentual', null, null, null),
    card('permutas', 'ocupacao-salas', 'moeda', null, null, null),
    card('novos-clientes', 'clientes', 'inteiro', null, null, null),
    card('contratos-cancelados', 'clientes', 'inteiro', null, null, null),
    card('despesas-pagas', 'clientes', 'moeda', 6978.25, 27679.28, -74.8),
  ],
};

function renderTela(
  corpo: IndicadoresFinanceiros = DADOS,
  usuario = USUARIO_TESTE,
  extra: Parameters<typeof apiFalsa>[0] = {},
) {
  const fetchMock = apiFalsa({
    usuario,
    ...extra,
    rotas: { [API]: () => json(corpo), ...extra.rotas },
  });
  return { user: userEvent.setup(), ...renderApp('/financeiro/indicadores', fetchMock), fetchMock };
}

describe('Indicadores Financeiros (/financeiro/indicadores)', () => {
  it('mostra título, as 3 seções e os 10 cards com valor, anterior e variação', async () => {
    renderTela();

    expect(
      await screen.findByRole('heading', { name: 'Indicadores Financeiros' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Visão consolidada dos principais indicadores do mês')).toBeVisible();
    for (const secao of ['Receitas', 'Ocupação de salas', 'Clientes']) {
      expect(await screen.findByRole('heading', { name: secao })).toBeVisible();
    }
    expect(await screen.findByTestId('valor-faturamento-total')).toHaveTextContent(
      /R\$\s*9\.070,00/,
    );
    expect(screen.getByTestId('anterior-faturamento-total')).toHaveTextContent(
      /Anterior: R\$\s*13\.650,00/,
    );
    expect(screen.getByTestId('variacao-faturamento-total')).toHaveTextContent('33,6%');
    expect(screen.getByTestId('valor-resultado-operacional')).toHaveTextContent(/2\.091,75/);
    expect(screen.getByText('Contratos cancelados')).toBeVisible();
  });

  it('indicador sem fonte de dados aparece como "—" e sem comparação', async () => {
    renderTela();

    expect(await screen.findByTestId('valor-taxa-ocupacao')).toHaveTextContent('—');
    expect(screen.queryByTestId('anterior-taxa-ocupacao')).not.toBeInTheDocument();
    expect(screen.queryByTestId('variacao-taxa-ocupacao')).not.toBeInTheDocument();
  });

  it('queda de despesa é bom (verde) e queda de faturamento é ruim (vermelho)', async () => {
    renderTela();

    expect(await screen.findByTestId('variacao-despesas-pagas')).toHaveClass('text-emerald-700');
    expect(screen.getByTestId('variacao-faturamento-total')).toHaveClass('text-red-700');
  });

  it('busca o mês atual ao abrir e de novo ao trocar o mês', async () => {
    const { fetchMock } = renderTela();
    const hoje = new Date();
    const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

    const campo = await screen.findByLabelText('Mês');
    expect(campo).toHaveValue(atual);
    expect(chamadasPara(fetchMock, API)[0]?.[0]).toContain(`mes=${atual}`);

    fireEvent.change(campo, { target: { value: '2026-10' } });

    await waitFor(() =>
      expect(chamadasPara(fetchMock, API).some(([url]) => url.includes('mes=2026-10'))).toBe(true),
    );
  });

  it('o botão Atualizar busca os indicadores de novo', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByTestId('valor-faturamento-total');
    const antes = chamadasPara(fetchMock, API).length;

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));

    await waitFor(() => expect(chamadasPara(fetchMock, API).length).toBe(antes + 1));
  });

  it('erro da API mostra a mensagem e Tentar novamente refaz a consulta', async () => {
    let chamadas = 0;
    const { user } = renderTela(DADOS, USUARIO_TESTE, {
      rotas: {
        [API]: () => {
          chamadas += 1;
          return chamadas === 1
            ? json({ statusCode: 404, code: 'NOT_FOUND', message: 'falha' }, 404)
            : json(DADOS);
        },
      },
    });

    expect(await screen.findByText('Não foi possível carregar os indicadores.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByTestId('valor-faturamento-total')).toBeVisible();
  });

  it('sem a permissão da tela, não mostra os indicadores', async () => {
    const { fetchMock } = renderTela(DADOS, {
      ...USUARIO_TESTE,
      permissoes: PERMISSOES.filter((p) => p !== 'financeiro.indicadores.ver'),
    });

    await waitFor(() => expect(screen.queryByTestId('valor-faturamento-total')).toBeNull());
    expect(chamadasPara(fetchMock, API)).toHaveLength(0);
  });

  it('em inglês: textos e números traduzidos (issue #205)', async () => {
    renderTela(DADOS, {
      ...USUARIO_TESTE,
      preferencias: { ...USUARIO_TESTE.preferencias, idioma: 'en' },
    });

    expect(await screen.findByRole('heading', { name: 'Financial Indicators' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Room occupancy' })).toBeVisible();
    expect(screen.getByText('Total Billing')).toBeVisible();
    expect(screen.getByTestId('anterior-faturamento-total')).toHaveTextContent(
      /Previous: R\$\s*13,650\.00/,
    );
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  });
});
