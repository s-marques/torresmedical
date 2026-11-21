import { PERMISSOES, PREFERENCIAS_PADRAO } from '@torres/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const CATALOGO = '/api/comercial-atendimento/relatorios';

const RELATORIOS = [
  { id: 'COM-01', nome: 'Taxa de Conversão por Origem' },
  { id: 'COM-02', nome: 'Pacientes Sem Retorno' },
  { id: 'COM-03', nome: 'Pacotes Acabando' },
  { id: 'COM-04', nome: 'Motivo de Perda' },
].map((r) => ({ ...r, colunas: [], filtros: [] }));

describe('Relatórios Comerciais (/crm/relatorios)', () => {
  it('abre a ReportPage com os relatórios COM-01 a COM-04 no seletor', async () => {
    const fetchMock = apiFalsa({ rotas: { [CATALOGO]: () => json({ data: RELATORIOS }) } });
    renderApp('/crm/relatorios', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Relatórios Comerciais' })).toBeVisible();
    expect(
      screen.getByText('Taxa de conversão, pacientes sem retorno, pacotes e motivos de perda.'),
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
    renderApp('/crm/relatorios', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Commercial Reports' })).toBeVisible();
    expect(
      screen.getByText(
        'Conversion rate, patients without a return visit, packages and loss reasons.',
      ),
    ).toBeVisible();
  });

  it('sem comercial-atendimento.relatorios.ver, mostra "Sem permissão" e não chama a API', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: PERMISSOES.filter((p) => p !== 'comercial-atendimento.relatorios.ver'),
    };
    const fetchMock = apiFalsa({ usuario });
    renderApp('/crm/relatorios', fetchMock);

    expect(await screen.findByRole('heading', { name: 'Sem permissão' })).toBeInTheDocument();
    expect(chamadasPara(fetchMock, CATALOGO)).toHaveLength(0);
  });
});
