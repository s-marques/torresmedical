import { PERMISSOES, PREFERENCIAS_PADRAO } from '@torres/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const CATALOGO = '/api/financeiro/relatorios';

const RELATORIOS = [
  { id: 'FIN-01', nome: 'Inadimplência' },
  { id: 'FIN-23', nome: 'DRE (por competência)' },
].map((r) => ({ ...r, colunas: [], filtros: [] }));

describe('Relatórios do Financeiro (/financeiro/relatorios)', () => {
  it('abre a ReportPage com o seletor de relatórios', async () => {
    const fetchMock = apiFalsa({ rotas: { [CATALOGO]: () => json({ data: RELATORIOS }) } });
    renderApp('/financeiro/relatorios', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Relatórios Financeiros' })).toBeVisible();
    expect(await screen.findByText('Selecione um relatório')).toBeInTheDocument();
    expect(chamadasPara(fetchMock, CATALOGO)).toHaveLength(1);
  });

  it('textos da tela no idioma do usuário (en)', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    const fetchMock = apiFalsa({ usuario, rotas: { [CATALOGO]: () => json({ data: [] }) } });
    renderApp('/financeiro/relatorios', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Financial Reports' })).toBeVisible();
  });

  it('sem financeiro.relatorios.ver, mostra "Sem permissão" e não chama a API', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: PERMISSOES.filter((p) => p !== 'financeiro.relatorios.ver'),
    };
    const fetchMock = apiFalsa({ usuario });
    renderApp('/financeiro/relatorios', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Sem permissão' })).toBeInTheDocument();
    expect(chamadasPara(fetchMock, CATALOGO)).toHaveLength(0);
  });
});
