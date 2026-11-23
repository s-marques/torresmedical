import { PERMISSOES, PREFERENCIAS_PADRAO } from '@torres/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const CATALOGO = '/api/compras-estoque/relatorios';

const RELATORIOS = [
  { id: 'EST-01', nome: 'Vencimento proximo (60 dias)' },
  { id: 'EST-05', nome: 'Posição de Estoque' },
  { id: 'EST-14', nome: 'Previsão de Compras' },
].map((r) => ({ ...r, colunas: [], filtros: [] }));

describe('Relatórios de Estoque (/estoque/relatorios)', () => {
  it('abre a ReportPage com o seletor de relatórios', async () => {
    const fetchMock = apiFalsa({ rotas: { [CATALOGO]: () => json({ data: RELATORIOS }) } });
    renderApp('/estoque/relatorios', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Relatórios de Estoque' })).toBeVisible();
    expect(await screen.findByText('Selecione um relatório')).toBeInTheDocument();
    expect(chamadasPara(fetchMock, CATALOGO)).toHaveLength(1);
  });

  it('textos da tela no idioma do usuário (en)', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    const fetchMock = apiFalsa({ usuario, rotas: { [CATALOGO]: () => json({ data: [] }) } });
    renderApp('/estoque/relatorios', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Inventory Reports' })).toBeVisible();
  });

  it('sem compras-estoque.relatorios.ver, mostra "Sem permissão" e não chama a API', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: PERMISSOES.filter((p) => p !== 'compras-estoque.relatorios.ver'),
    };
    const fetchMock = apiFalsa({ usuario });
    renderApp('/estoque/relatorios', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Sem permissão' })).toBeInTheDocument();
    expect(chamadasPara(fetchMock, CATALOGO)).toHaveLength(0);
  });
});
