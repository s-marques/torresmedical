const TELAS_DE_AUTH = ['/login', '/esqueci-senha', '/redefinir-senha', '/trocar-senha'];

/**
 * Para onde ir depois do login. Só caminhos internos (`/...`): nada de `//outro-site` ou URL
 * absoluta, que levariam o usuário para fora do sistema (open redirect).
 */
export function destinoAposLogin(redirect: string | null): string {
  if (!redirect?.startsWith('/') || redirect.startsWith('//') || redirect.startsWith('/\\')) {
    return '/';
  }
  const caminho = redirect.split(/[?#]/)[0] ?? '';
  return TELAS_DE_AUTH.includes(caminho) ? '/' : redirect;
}
