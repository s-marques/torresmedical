import { PERMISSOES, PREFERENCIAS_PADRAO } from '@torres/shared';
import type { Page } from '@playwright/test';

const ID = '00000000-0000-4000-8000-000000000001';

const META_VAZIA = { page: 1, pageSize: 10, total: 0, totalPages: 0 };

/** Sessão de um usuário com todas as permissões (o layout não depende do perfil). */
const SESSAO = {
  accessToken: 'token-falso',
  expiraEm: '2099-01-01T00:00:00.000Z',
  usuario: {
    id: ID,
    nome: 'Usuário de Teste',
    email: 'teste@example.com',
    perfil: { id: ID, nome: 'Administrador' },
    permissoes: [...PERMISSOES],
    avatarArquivoId: null,
    trocarSenha: false,
    preferencias: PREFERENCIAS_PADRAO,
  },
};

export type RespostaFalsa = { status?: number; corpo: unknown };
export type Fixtures = Record<string, (url: URL) => RespostaFalsa>;

/**
 * Simula a API: refresh devolve a sessão (ou 401 no modo anônimo), fixtures respondem às rotas
 * conhecidas e o resto devolve uma listagem vazia.
 */
export async function simularApi(
  page: Page,
  { anonimo = false, fixtures = {} }: { anonimo?: boolean; fixtures?: Fixtures } = {},
): Promise<void> {
  await page.route('**/api/**', async (rota) => {
    const url = new URL(rota.request().url());
    const caminho = url.pathname;
    if (caminho === '/api/auth/refresh') {
      return anonimo
        ? rota.fulfill({
            status: 401,
            json: { statusCode: 401, code: 'UNAUTHORIZED', message: '' },
          })
        : rota.fulfill({ json: SESSAO });
    }
    const chave = Object.keys(fixtures).find((c) => caminho.startsWith(c));
    const resposta = chave ? fixtures[chave]!(url) : { corpo: { data: [], meta: META_VAZIA } };
    return rota.fulfill({ status: resposta.status ?? 200, json: resposta.corpo });
  });
}
