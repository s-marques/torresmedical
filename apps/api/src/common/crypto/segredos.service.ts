import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const ALGORITMO = 'aes-256-gcm';
const PREFIXO = 'v1';
const IV_BYTES = 12;
const MIN_SEGREDO = 32;
const CONTEXTO = 'torres-segredos-v1';

/** Chave de 32 bytes a partir do segredo de ambiente (HKDF-SHA256). */
export function derivarChave(segredo: string): Buffer {
  return Buffer.from(hkdfSync('sha256', segredo, '', CONTEXTO, 32));
}

/**
 * Cifra credenciais de terceiros (ex.: Memed) antes de gravar no banco, com AES-256-GCM.
 * A chave vem de `SECRETS_ENCRYPTION_KEY` (mínimo 32 caracteres); sem ela, de `AUTH_JWT_SECRET`.
 * Formato gravado: `v1:<iv>:<tag>:<texto cifrado>` (base64).
 */
@Injectable()
export class SegredosService {
  private chave: Buffer | null = null;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  cifrar(texto: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITMO, this.obterChave(), iv);
    const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    return [
      PREFIXO,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      cifrado.toString('base64'),
    ].join(':');
  }

  /** `null` quando o valor não está no formato cifrado ou a chave não confere. */
  decifrar(valor: string): string | null {
    const [prefixo, iv, tag, cifrado] = valor.split(':');
    if (prefixo !== PREFIXO || !iv || !tag || !cifrado) return null;
    try {
      const decipher = createDecipheriv(ALGORITMO, this.obterChave(), Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(cifrado, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
  }

  private obterChave(): Buffer {
    if (!this.chave) {
      const segredo = this.env.SECRETS_ENCRYPTION_KEY || this.env.AUTH_JWT_SECRET || '';
      if (segredo.length < MIN_SEGREDO) {
        throw new Error(`Defina SECRETS_ENCRYPTION_KEY com pelo menos ${MIN_SEGREDO} caracteres.`);
      }
      this.chave = derivarChave(segredo);
    }
    return this.chave;
  }
}
