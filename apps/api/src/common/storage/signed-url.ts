import { createHmac, timingSafeEqual } from 'node:crypto';

export type VerificacaoLink = 'valido' | 'invalido' | 'expirado';

/**
 * Assina e confere as URLs temporárias de download (HMAC-SHA256 de `id.expira`).
 * O arquivo sai pela própria API: o MinIO continua só na rede interna.
 */
export class UrlSigner {
  constructor(private readonly secret: string) {}

  /** Assinatura em base64url (43 caracteres). `expira` em segundos desde a época. */
  sign(id: string, expira: number): string {
    return createHmac('sha256', this.secret).update(`${id}.${expira}`).digest('base64url');
  }

  /** Confere a assinatura antes da validade, para que uma expiração adulterada seja "inválida". */
  verify(id: string, expira: number, assinatura: string, agora = Date.now()): VerificacaoLink {
    const esperada = Buffer.from(this.sign(id, expira));
    const recebida = Buffer.from(assinatura);
    if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) {
      return 'invalido';
    }
    return expira * 1000 < agora ? 'expirado' : 'valido';
  }
}
