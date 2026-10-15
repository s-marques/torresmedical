import { afterEach, describe, expect, it, vi } from 'vitest';
import { baixarArquivo } from './download';

// O jsdom não implementa `URL.createObjectURL`/`revokeObjectURL`.
const urlOriginal = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

afterEach(() => {
  vi.useRealTimers();
  URL.createObjectURL = urlOriginal.create;
  URL.revokeObjectURL = urlOriginal.revoke;
});

describe('baixarArquivo', () => {
  it('salva o arquivo com o nome da API e libera a URL', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('x', { headers: { 'Content-Disposition': 'attachment; filename="r.pdf"' } }),
      ),
    );
    URL.createObjectURL = vi.fn(() => 'blob:1');
    const revokeObjectURL = vi.fn();
    URL.revokeObjectURL = revokeObjectURL;
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await baixarArquivo('/api/x/export', { format: 'pdf' });

    expect(clique).toHaveBeenCalledTimes(1);
    const link = clique.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('r.pdf');
    expect(link.isConnected).toBe(false);
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });
});
