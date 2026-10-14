import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

function mockFetch(response: Partial<Response> | Error) {
  const fn =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('App', () => {
  it('mostra o título e consulta /api/health', async () => {
    const fetchMock = mockFetch({
      ok: true,
      json: async () => ({ status: 'ok', uptime: 1, timestamp: new Date().toISOString() }),
    });

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Torres Medical' })).toBeInTheDocument();
    expect(await screen.findByText('online')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('mostra API indisponível quando a resposta não é ok', async () => {
    mockFetch({ ok: false, status: 502 });

    render(<App />);

    expect(await screen.findByText('indisponível')).toBeInTheDocument();
  });

  it('mostra API indisponível quando a resposta foge do schema', async () => {
    mockFetch({ ok: true, json: async () => ({ status: 'down' }) });

    render(<App />);

    expect(await screen.findByText('indisponível')).toBeInTheDocument();
  });

  it('mostra API indisponível quando a rede falha', async () => {
    mockFetch(new Error('falha de rede'));

    render(<App />);

    expect(await screen.findByText('indisponível')).toBeInTheDocument();
  });
});
