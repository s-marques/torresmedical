import { PERMISSOES, PREFERENCIAS_PADRAO } from '@torres/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const CATALOGO = '/api/gestao-profissionais/relatorios';

const RELATORIOS = [
  { id: 'RP-01', nome: 'Receita por Profissional' },
  { id: 'RP-08', nome: 'Inadimplência' },
  { id: 'RP-13', nome: 'Consultas por Profissional e Forma de Pagamento' },
].map((r) => ({ ...r, colunas: [], filtros: [] }));

describe('Relatórios de Receita Profissionais (/receita-profissionais/relatorios)', () => {
  it('abre a ReportPage com o seletor de relatórios', async () => {
    const fetchMock = apiFalsa({ rotas: { [CATALOGO]: () => json({ data: RELATORIOS }) } });
    renderApp('/receita-profissionais/relatorios', fetchMock);

    expect(
      await screen.findByRole('heading', { name: 'Relatórios de Receita Profissionais' }),
    ).toBeVisible();
    expect(await screen.findByText('Selecione um relatório')).toBeInTheDocument();
    expect(chamadasPara(fetchMock, CATALOGO)).toHaveLength(1);
  });

  it('textos da tela no idioma do usuário (en)', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    const fetchMock = apiFalsa({ usuario, rotas: { [CATALOGO]: () => json({ data: [] }) } });
    renderApp('/receita-profissionais/relatorios', fetchMock);

    expect(
      await screen.findByRole('heading', { name: 'Professional Revenue Reports' }),
    ).toBeVisible();
  });

  it('sem gestao-profissionais.relatorios.ver, mostra "Sem permissão" e não chama a API', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: PERMISSOES.filter((p) => p !== 'gestao-profissionais.relatorios.ver'),
    };
    const fetchMock = apiFalsa({ usuario });
    renderApp('/receita-profissionais/relatorios', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Sem permissão' })).toBeInTheDocument();
    expect(chamadasPara(fetchMock, CATALOGO)).toHaveLength(0);
  });
});
