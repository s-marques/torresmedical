import { stdSerializers } from 'pino';

/**
 * Rotas cujo termo de busca pode ser dado pessoal (nome, CPF, telefone): o log guarda só o
 * caminho, sem a query string (issue #159).
 */
const ROTAS_SEM_QUERY = ['/api/painel/busca'];

function semQuery(url: string): string {
  const caminho = url.split('?', 1)[0] ?? url;
  return ROTAS_SEM_QUERY.includes(caminho) ? caminho : url;
}

/** Serializador de `req` do pino-http: o padrão, sem o termo pesquisado nas rotas de busca. */
export function serializarRequisicao(req: Parameters<typeof stdSerializers.req>[0]) {
  const serializada = stdSerializers.req(req);
  const url = semQuery(serializada.url);
  if (url === serializada.url) return serializada;
  return { ...serializada, url, query: undefined };
}
