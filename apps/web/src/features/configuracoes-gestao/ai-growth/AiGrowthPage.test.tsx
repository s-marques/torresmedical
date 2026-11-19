import type { AiGrowthPainel } from '@torres/shared';
import { PERMISSOES, PREFERENCIAS_PADRAO } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/configuracoes-gestao/ai-growth';
const ANALISE_ID = '00000000-0000-4000-8000-0000000000a1';
const CONCLUIDA_EM = '2026-06-18T17:52:00.000Z';

const analise = (status: 'CONCLUIDA' | 'PENDENTE') => ({
  id: ANALISE_ID,
  status,
  solicitadaEm: CONCLUIDA_EM,
  concluidaEm: status === 'CONCLUIDA' ? CONCLUIDA_EM : null,
});

const insight = (
  n: number,
  tipo: string,
  quantidade: number,
  prioridade: string,
  parametros = {},
) => ({
  id: `00000000-0000-4000-8000-00000000010${n}`,
  tipo,
  quantidade,
  prioridade,
  parametros,
});

const PAINEL: AiGrowthPainel = {
  ultimaAnalise: analise('CONCLUIDA'),
  emAndamento: null,
  pontosAtencao: 3,
  insights: [
    insight(1, 'PACIENTES_INATIVOS', 0, 'BAIXA', { dias: 60 }),
    insight(2, 'FALTAS_RECENTES', 2, 'MEDIA', { dias: 90 }),
    insight(3, 'PROFISSIONAIS_SUBUTILIZADOS', 6, 'MEDIA', {
      media: 16.3,
      faturado: 8900.02,
      dias: 30,
    }),
  ],
} as AiGrowthPainel;

function renderTela(painel: AiGrowthPainel = PAINEL, extra: Parameters<typeof apiFalsa>[0] = {}) {
  const fetchMock = apiFalsa({
    ...extra,
    rotas: { [API]: () => json(painel), ...extra.rotas },
  });
  return { user: userEvent.setup(), ...renderApp('/ai-growth', fetchMock), fetchMock };
}

describe('AI Growth (/ai-growth)', () => {
  it('mostra título, última análise, pontos de atenção e os cards com destaque e recomendação', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'AI Growth' })).toBeInTheDocument();
    expect(await screen.findByText(/Última análise: 18\/06\/2026/)).toBeVisible();
    expect(screen.getByText(/3 pontos de atenção/)).toBeVisible();
    expect(screen.getByText('Nenhum paciente inativo há +60 dias')).toBeVisible();
    expect(screen.getByText('2 faltas nos últimos 90 dias')).toBeVisible();
    expect(screen.getByText('2 faltas (90 dias)')).toBeVisible();
    expect(screen.getByText('6 profissionais com agenda subutilizada')).toBeVisible();
    expect(screen.getByText(/R\$\s*8\.900,02 faturado \(30d\)/)).toBeVisible();
    expect(screen.getByText(/média de 16,3 atendimentos/)).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Ver detalhes' })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Analisar Agora' })).toBeEnabled();
  });

  it('Ver detalhes abre o modal com texto, chips, "O que fazer:" e fecha', async () => {
    const { user } = renderTela();
    const [primeiro] = await screen.findAllByRole('button', { name: 'Ver detalhes' });
    await user.click(primeiro as HTMLElement);

    const modal = await screen.findByRole('dialog', {
      name: 'Nenhum paciente inativo há +60 dias',
    });
    expect(within(modal).getByText('Sem pendências')).toBeVisible();
    expect(within(modal).getByText('Prioridade baixa')).toBeVisible();
    expect(within(modal).getByText('O que fazer:')).toBeVisible();
    expect(within(modal).getByText('Texto gerado a partir dos números acima.')).toBeVisible();

    await user.click(within(modal).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Analisar Agora faz POST em /analisar e busca o painel de novo', async () => {
    let chamadas = 0;
    const { user, fetchMock } = renderTela(PAINEL, {
      rotas: {
        [`${API}/analisar`]: () => json(analise('PENDENTE'), 202),
        [API]: () => {
          chamadas += 1;
          return json(chamadas > 1 ? { ...PAINEL, emAndamento: analise('PENDENTE') } : PAINEL);
        },
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Analisar Agora' }));

    expect(await screen.findByRole('button', { name: 'Analisando…' })).toBeDisabled();
    expect(chamadasPara(fetchMock, `${API}/analisar`)).toHaveLength(1);
    expect(chamadasPara(fetchMock, `${API}/analisar`)[0]?.[1]?.method).toBe('POST');
  });

  it('análise em andamento desabilita o botão', async () => {
    renderTela({ ...PAINEL, emAndamento: analise('PENDENTE') });
    expect(await screen.findByRole('button', { name: 'Analisando…' })).toBeDisabled();
  });

  it('sem análise ainda, orienta a clicar em "Analisar Agora"', async () => {
    renderTela({ ultimaAnalise: null, emAndamento: null, insights: [], pontosAtencao: 0 });
    expect(await screen.findByText(/Nenhuma análise realizada ainda/)).toBeVisible();
  });

  it('esconde "Analisar Agora" sem a permissão de criar', async () => {
    renderTela(PAINEL, {
      usuario: {
        ...USUARIO_TESTE,
        permissoes: PERMISSOES.filter((p) => p !== 'configuracoes-gestao.ai-growth.criar'),
      },
    });
    await screen.findByText('Nenhum paciente inativo há +60 dias');
    expect(screen.queryByRole('button', { name: 'Analisar Agora' })).not.toBeInTheDocument();
  });

  it('mostra erro com "Tentar novamente" quando a API falha', async () => {
    renderTela(PAINEL, {
      rotas: { [API]: () => json({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'x' }, 500) },
    });
    expect(await screen.findByText('Não foi possível carregar o AI Growth.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  });

  it('em inglês traduz a tela, os cards e o modal', async () => {
    const { user } = renderTela(PAINEL, {
      usuario: { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' } },
    });

    expect(await screen.findByText(/Last analysis:/)).toBeVisible();
    expect(screen.getByText(/3 attention points/)).toBeVisible();
    expect(screen.getByText('No patients inactive for +60 days')).toBeVisible();
    expect(screen.getByText('2 no-shows in the last 90 days')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Analyze Now' })).toBeVisible();

    await user.click(screen.getAllByRole('button', { name: 'View details' })[1] as HTMLElement);
    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByText('What to do:')).toBeVisible();
    expect(within(modal).getByText('medium priority')).toBeVisible();
  });
});
