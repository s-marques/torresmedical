/** Primeiro erro de cada campo de um resultado inválido do Zod: `{ email: 'E-mail inválido' }`. */
export function errosDoZod(issues: readonly { path: readonly PropertyKey[]; message: string }[]) {
  const erros: Record<string, string> = {};
  for (const { path, message } of issues) {
    const campo = path.map(String).join('.');
    erros[campo] ??= message;
  }
  return erros;
}
