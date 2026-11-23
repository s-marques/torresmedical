import { PERMISSOES, PREFERENCIAS_PADRAO } from '@torres/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const CATALOGO = '/api/configuracoes-gestao/relatorios';

const RELATORIOS = [
  { id: 'GES-01', nome: 'Log de Acesso' },
  { id: 'GES-02', nome: 'Ticket Médio por Canal' },
  { id: 'GES-03', nome: 'Ocupação por Sala' },
  { id: 'GES-04', nome: 'LTV Paciente' },
].map((r) => ({ ...r, colunas: [], filtros: [] }));

describe('Relatórios de Gestão (/gestao/relatorios)', () => {
  it('abre a ReportPage com os relatórios GES-01 a GES-04 no seletor', async () => {
    const fetchMock = apiFalsa({ rotas: { [CATALOGO]: () => json({ data: RELATORIOS }) } });
    renderApp('/gestao/relatorios', fetchMock);

    expect(
      await screen.findByRole('heading', { name: 'Relatórios de Gestão' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Log de acesso, ticket médio, ocupação de sala e LTV.')).toBeVisible();
    expect(await screen.findByText('Selecione um relatório')).toBeInTheDocument();
    expect(chamadasPara(fetchMock, CATALOGO)).toHaveLength(1);
  });

  it('textos da tela no idioma do usuário (en)', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    const fetchMock = apiFalsa({ usuario, rotas: { [CATALOGO]: () => json({ data: [] }) } });
    renderApp('/gestao/relatorios', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Management Reports' })).toBeVisible();
    expect(screen.getByText('Access log, average ticket, room occupancy and LTV.')).toBeVisible();
  });

  it('sem configuracoes-gestao.relatorios.ver, mostra "Sem permissão" e não chama a API', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: PERMISSOES.filter((p) => p !== 'configuracoes-gestao.relatorios.ver'),
    };
    const fetchMock = apiFalsa({ usuario });
    renderApp('/gestao/relatorios', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Sem permissão' })).toBeInTheDocument();
    expect(chamadasPara(fetchMock, CATALOGO)).toHaveLength(0);
  });
});
