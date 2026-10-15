import { hash, verify } from '@node-rs/argon2';

/** Hash argon2id da senha (parâmetros padrão da biblioteca, recomendados pela OWASP). */
export function hashSenha(senha: string): Promise<string> {
  return hash(senha);
}

// Hash de uma senha qualquer, para gastar o mesmo tempo quando o usuário não existe
// (sem isso, a resposta mais rápida revelaria quais e-mails estão cadastrados).
let hashFicticio: Promise<string> | undefined;

/** Confere a senha. Sem hash (usuário inexistente ou sem senha), verifica contra um fictício. */
export async function verificarSenha(senha: string, senhaHash: string | null): Promise<boolean> {
  if (!senhaHash) {
    hashFicticio ??= hash('senha-ficticia-para-tempo-constante');
    await verify(await hashFicticio, senha);
    return false;
  }
  try {
    return await verify(senhaHash, senha);
  } catch {
    return false;
  }
}
