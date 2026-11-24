import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/comercial-atendimento/grupos-whatsapp';
const CANAL = '00000000-0000-4000-8000-0000000000c1';

function api(grupos: { id: string; nome: string; participantes: number }[]) {
  return apiFalsa({
    rotas: {
      [API]: () =>
        json({
          data: grupos,
          meta: { page: 1, pageSize: 10, total: grupos.length, totalPages: 1 },
        }),
      '/api/lookups/canais-whatsapp': () =>
        json({
          data: [
            { id: CANAL, label: 'Canal Principal', descricao: '5565999990001' },
            {
              id: '00000000-0000-4000-8000-0000000000c2',
              label: 'Gerência Geral',
              descricao: null,
            },
          ],
          meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
        }),
      [`/api/lookups/canais-whatsapp/${CANAL}`]: () =>
        json({ id: CANAL, label: 'Canal Principal', descricao: '5565999990001' }),
    },
  });
}

function renderTela(grupos: Parameters<typeof api>[0] = []) {
  const fetchMock = api(grupos);
  return { user: userEvent.setup(), ...renderApp('/grupos-whatsapp', fetchMock), fetchMock };
}

describe('Grupos WhatsApp (/grupos-whatsapp)', () => {
  it('abre sem canal: mostra o seletor e a orientação, sem consultar os grupos', async () => {
    const { fetchMock } = renderTela();
    expect(await screen.findByRole('heading', { name: 'Grupos WhatsApp' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Canal WhatsApp' })).toHaveTextContent(
      'Selecione o canal',
    );
    expect(screen.getByText('Selecione um canal para listar os grupos.')).toBeVisible();
    expect(chamadasPara(fetchMock, API)).toHaveLength(0);
  });

  it('o seletor lista os canais do lookup', async () => {
    const { user } = renderTela();
    await user.click(await screen.findByRole('combobox', { name: 'Canal WhatsApp' }));
    expect(await screen.findByText('Canal Principal')).toBeVisible();
    expect(screen.getByText('Gerência Geral')).toBeVisible();
  });

  it('ao escolher o canal consulta a API com o canalId e mostra os grupos', async () => {
    const { user, fetchMock } = renderTela([
      { id: '1203@g.us', nome: 'Equipe Médica', participantes: 7 },
    ]);
    await user.click(await screen.findByRole('combobox', { name: 'Canal WhatsApp' }));
    await user.click(await screen.findByText('Canal Principal'));

    expect(await screen.findByText('Equipe Médica')).toBeVisible();
    expect(screen.getByText('1203@g.us')).toBeVisible();
    expect(screen.getByText('1 grupo(s)')).toBeVisible();
    expect(screen.queryByText('Selecione um canal para listar os grupos.')).toBeNull();
    await waitFor(() => {
      const [url] = chamadasPara(fetchMock, API).at(-1) ?? [];
      expect(url).toContain(`canalId=${CANAL}`);
    });
  });

  it('canal sem grupos mostra o estado vazio', async () => {
    const { user } = renderTela([]);
    await user.click(await screen.findByRole('combobox', { name: 'Canal WhatsApp' }));
    await user.click(await screen.findByText('Canal Principal'));
    expect(await screen.findByText('Nenhum grupo encontrado.')).toBeVisible();
  });
});
