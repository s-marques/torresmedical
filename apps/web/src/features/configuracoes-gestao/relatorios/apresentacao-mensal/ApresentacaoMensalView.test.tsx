import { PERMISSOES, PREFERENCIAS_PADRAO, type IndicadorApresentacao } from '@torres/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';
import { mesPadrao } from './formatar-apresentacao';

// A aplicação inteira renderiza devagar com a cobertura ligada.
vi.setConfig({ testTimeout: 20_000 });

const URL_API = '/api/configuracoes-gestao/apresentacao-mensal';
const URL_PDF = `${URL_API}/pdf`;
const TELA = '/gestao/relatorios?visao=apresentacao&mes=2026-10';

const ponto = (
  rotulo: string,
  valor: number | null,
  anterior: number | null = null,
  chave: string | null = null,
) => ({ rotulo, chave, valor, anterior });

const base = { variacao: null, detalhe: [], avisos: [] } as const;

const INDICADORES: IndicadorApresentacao[] = [
  {
    ...base,
    id: 'faturamento',
    numero: 1,
    formato: 'moeda',
    grafico: 'tendencia',
    comparacao: 'MES_ANTERIOR',
    valor: 1500,
    anterior: 1000,
    variacao: 50,
    serie: [ponto('2026-09', 1000), ponto('2026-10', 1500)],
  },
  {
    ...base,
    id: 'despesas-centro-custo',
    numero: 5,
    formato: 'moeda',
    grafico: 'comparativo',
    comparacao: 'MEDIA_90_DIAS',
    valor: 400,
    anterior: 310,
    variacao: 29,
    serie: [ponto('Limpeza', 300, 310), ponto('Outros', 100, 0, 'outros')],
  },
  {
    ...base,
    id: 'visitas',
    numero: 8,
    formato: 'numero',
    grafico: 'comparativo',
    comparacao: 'MES_ANTERIOR',
    valor: 1,
    anterior: 1,
    variacao: 0,
    serie: [
      ponto('Visitas agendadas', 2, 1, 'visitas-agendadas'),
      ponto('Visitas recebidas na clínica', null, null, 'visitas-recebidas'),
    ],
    detalhe: [ponto('Dr. Fictício', 1)],
    avisos: ['VISITAS_RECEBIDAS_INDISPONIVEL'],
  },
  {
    ...base,
    id: 'nps-medicos',
    numero: 9,
    formato: 'nps',
    grafico: 'tendencia',
    comparacao: 'MES_ANTERIOR',
    valor: 50,
    anterior: 100,
    variacao: -50,
    serie: [ponto('2026-08', null), ponto('2026-09', 100), ponto('2026-10', 50)],
  },
  {
    ...base,
    id: 'estoque',
    numero: 6,
    formato: 'numero',
    grafico: 'comparativo',
    comparacao: 'MEDIA_90_DIAS',
    valor: null,
    anterior: null,
    serie: [ponto('Material de limpeza', 12, 31)],
    avisos: ['ESTOQUE_POR_CATEGORIA'],
  },
  {
    ...base,
    id: 'nps-pacientes',
    numero: 10,
    formato: 'nps',
    grafico: 'tendencia',
    comparacao: 'MES_ANTERIOR',
    valor: null,
    anterior: null,
    serie: [ponto('2026-10', null)],
    avisos: ['NPS_PACIENTES_TODOS'],
  },
];

const RELATORIO = {
  mes: '2026-10',
  mesAnterior: '2026-09',
  geradoEm: '2026-11-01T12:00:00.000Z',
  indicadores: INDICADORES,
};

function pdfFalso() {
  return new Response('%PDF-1.7', {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="apresentacao-mensal-2026-10.pdf"',
    },
  });
}

describe('Apresentação mensal da gestão (/gestao/relatorios?visao=apresentacao)', () => {
  const urlOriginal = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:1');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    URL.createObjectURL = urlOriginal.create;
    URL.revokeObjectURL = urlOriginal.revoke;
  });

  it('mostra um card por indicador, com número, comparação, gráfico e observações', async () => {
    const fetchMock = apiFalsa({ rotas: { [URL_API]: () => json(RELATORIO) } });
    renderApp(TELA, fetchMock);

    expect(await screen.findByRole('heading', { name: 'Apresentação mensal' })).toBeVisible();
    const faturamento = within(await screen.findByTestId('indicador-faturamento'));
    expect(faturamento.getByText('1. Faturamento')).toBeVisible();
    expect(faturamento.getByText(/R\$\s?1\.500,00/, { selector: 'p' })).toBeVisible();
    expect(faturamento.getByText(/Mês anterior:.*1\.000,00.*Variação: \+50%/)).toBeVisible();
    expect(faturamento.getByRole('img', { name: /Faturamento nos últimos meses/ })).toBeVisible();

    const despesas = within(screen.getByTestId('indicador-despesas-centro-custo'));
    expect(despesas.getByText('Limpeza')).toBeVisible();
    expect(despesas.getByText('Outros')).toBeVisible(); // rótulo traduzido pela chave
    expect(despesas.getByText(/Média dos 90 dias anteriores:/)).toBeVisible();

    const nps = within(screen.getByTestId('indicador-nps-medicos'));
    expect(nps.getByText(/Variação: -50 p\.p\./)).toBeVisible();
    expect(nps.getByText('Dado indisponível')).toBeVisible(); // mês sem respostas no gráfico
    expect(chamadasPara(fetchMock, URL_API)[0]?.[0]).toContain('mes=2026-10');
  });

  it('dado sem fonte aparece como "Dado indisponível", nunca como número', async () => {
    renderApp(TELA, apiFalsa({ rotas: { [URL_API]: () => json(RELATORIO) } }));

    const visitas = within(await screen.findByTestId('indicador-visitas'));
    const linha = visitas.getByText('Visitas recebidas na clínica').closest('li');
    expect(within(linha as HTMLElement).getByText('Dado indisponível')).toBeVisible();
    expect(visitas.getByText('Dr. Fictício')).toBeVisible();
    expect(visitas.getByText(/Visitas recebidas na clínica: dado indisponível/)).toBeVisible();

    const semNada = within(screen.getByTestId('indicador-nps-pacientes'));
    expect(semNada.getAllByText('Dado indisponível').length).toBeGreaterThan(0);
    expect(semNada.getByText(/não distingue o atendimento pela recepção/)).toBeVisible();
    // Estoque não soma unidades diferentes: sem número grande.
    const estoque = within(screen.getByTestId('indicador-estoque'));
    expect(estoque.getByText('Material de limpeza')).toBeVisible();
    expect(estoque.getByText(/não há total/)).toBeVisible();
  });

  it('o mês padrão é o anterior ao de hoje e trocar o mês consulta de novo', async () => {
    const fetchMock = apiFalsa({ rotas: { [URL_API]: () => json(RELATORIO) } });
    renderApp('/gestao/relatorios?visao=apresentacao', fetchMock);

    const campo = await screen.findByLabelText('Mês');
    await waitFor(() => expect(campo).toHaveValue(mesPadrao()));
    expect(chamadasPara(fetchMock, URL_API)[0]?.[0]).toContain(`mes=${mesPadrao()}`);

    fireEvent.change(campo, { target: { value: '2026-03' } });

    await waitFor(() =>
      expect(chamadasPara(fetchMock, URL_API).at(-1)?.[0]).toContain('mes=2026-03'),
    );
  });

  it('mês inválido na URL volta ao padrão', async () => {
    const fetchMock = apiFalsa({ rotas: { [URL_API]: () => json(RELATORIO) } });
    renderApp('/gestao/relatorios?visao=apresentacao&mes=2026-99', fetchMock);

    expect(await screen.findByLabelText('Mês')).toHaveValue(mesPadrao());
  });

  it('"Exportar PDF" baixa o PDF do mês escolhido', async () => {
    const user = userEvent.setup();
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const fetchMock = apiFalsa({
      rotas: { [URL_API]: () => json(RELATORIO), [URL_PDF]: () => pdfFalso() },
    });
    renderApp(TELA, fetchMock);

    await user.click(await screen.findByRole('button', { name: 'Exportar PDF' }));

    await waitFor(() => expect(chamadasPara(fetchMock, URL_PDF)).toHaveLength(1));
    expect(chamadasPara(fetchMock, URL_PDF)[0]?.[0]).toContain('mes=2026-10');
    await waitFor(() => expect(clique).toHaveBeenCalledOnce());
  });

  it('sem permissão de exportar não há botão de PDF', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: PERMISSOES.filter((p) => p !== 'configuracoes-gestao.relatorios.exportar'),
    };
    renderApp(TELA, apiFalsa({ usuario, rotas: { [URL_API]: () => json(RELATORIO) } }));

    await screen.findByTestId('indicador-faturamento');
    expect(screen.queryByRole('button', { name: 'Exportar PDF' })).not.toBeInTheDocument();
  });

  it('sem nenhum indicador permitido mostra o estado vazio e desabilita o PDF', async () => {
    renderApp(
      TELA,
      apiFalsa({ rotas: { [URL_API]: () => json({ ...RELATORIO, indicadores: [] }) } }),
    );

    expect(await screen.findByText('Nenhum indicador disponível')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeDisabled();
  });

  it('textos no idioma do usuário (en), com os rótulos fixos traduzidos', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    renderApp(TELA, apiFalsa({ usuario, rotas: { [URL_API]: () => json(RELATORIO) } }));

    expect(await screen.findByRole('heading', { name: 'Monthly presentation' })).toBeVisible();
    const visitas = within(await screen.findByTestId('indicador-visitas'));
    expect(visitas.getByText('8. Visits to doctors')).toBeVisible();
    expect(visitas.getByText('Visits received at the clinic')).toBeVisible();
    expect(visitas.getByText('Data unavailable')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeVisible();
    expect(screen.getByTestId('indicador-despesas-centro-custo')).toHaveTextContent(
      'Average of the previous 90 days',
    );
  });

  it('textos no idioma do usuário (es)', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'es' as const },
    };
    renderApp(TELA, apiFalsa({ usuario, rotas: { [URL_API]: () => json(RELATORIO) } }));

    expect(await screen.findByRole('heading', { name: 'Presentación mensual' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeVisible();
    expect(await screen.findByText('9. NPS de los médicos clientes')).toBeVisible();
  });

  it('a tela de Relatórios tem o atalho para a apresentação e o link de volta', async () => {
    const user = userEvent.setup();
    const fetchMock = apiFalsa({
      rotas: {
        '/api/configuracoes-gestao/relatorios': () => json({ data: [] }),
        [URL_API]: () => json(RELATORIO),
      },
    });
    const { router } = renderApp('/gestao/relatorios', fetchMock);

    await user.click(await screen.findByRole('link', { name: 'Apresentação mensal' }));
    expect(await screen.findByTestId('indicador-faturamento')).toBeVisible();
    expect(router.state.location.search).toContain('visao=apresentacao');

    await user.click(screen.getByRole('link', { name: 'Voltar aos relatórios' }));
    expect(await screen.findByRole('heading', { name: 'Relatórios de Gestão' })).toBeVisible();
  });

  it('sem configuracoes-gestao.relatorios.ver mostra "Sem permissão" e não chama a API', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: PERMISSOES.filter((p) => p !== 'configuracoes-gestao.relatorios.ver'),
    };
    const fetchMock = apiFalsa({ usuario });
    renderApp(TELA, fetchMock);

    expect(await screen.findByRole('heading', { name: 'Sem permissão' })).toBeVisible();
    expect(chamadasPara(fetchMock, URL_API)).toHaveLength(0);
  });
});
