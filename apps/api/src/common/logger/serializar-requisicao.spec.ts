import type { IncomingMessage } from 'node:http';
import { serializarRequisicao } from './serializar-requisicao';

function requisicao(url: string): IncomingMessage {
  return {
    method: 'GET',
    url,
    headers: {},
    query: { q: '39053344705' },
  } as unknown as IncomingMessage;
}

describe('serializarRequisicao', () => {
  it('remove o termo pesquisado da URL da busca global', () => {
    const log = serializarRequisicao(requisicao('/api/painel/busca?q=39053344705'));
    expect(log.url).toBe('/api/painel/busca');
    expect(JSON.stringify(log)).not.toContain('39053344705');
  });

  it('mantém a URL das outras rotas', () => {
    const log = serializarRequisicao(requisicao('/api/painel/alertas?incluirResolvidos=true'));
    expect(log.url).toBe('/api/painel/alertas?incluirResolvidos=true');
  });
});
