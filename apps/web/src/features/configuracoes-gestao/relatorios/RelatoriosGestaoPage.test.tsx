import { PERMISSOES } from '@torres/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const CATALOGO = '/api/configuracoes-gestao/relatorios';

describe('Relatórios de Gestão (/gestao/relatorios)', () => {
  it('abre a ReportPage da tela com o catálogo do módulo', async () => {
    const fetchMock = apiFalsa({ rotas: { [CATALOGO]: () => json({ data: [] }) } });
    renderApp('/gestao/relatorios', fetchMock);

    expect(
      await screen.findByRole('heading', { name: 'Relatórios de Gestão' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Log de acesso, ticket médio, ocupação de sala e LTV.')).toBeVisible();
    expect(await screen.findByText('Selecione um relatório')).toBeInTheDocument();
    expect(chamadasPara(fetchMock, CATALOGO)).toHaveLength(1);
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
