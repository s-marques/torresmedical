import { UrlSigner } from './signed-url';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('UrlSigner', () => {
  const signer = new UrlSigner('segredo-de-teste-das-urls-de-download-0001');
  const agora = Date.parse('2026-10-14T12:00:00.000Z');
  const expira = agora / 1000 + 60;

  it('assinatura base64url de 43 caracteres, determinística por id e validade', () => {
    const assinatura = signer.sign(ID, expira);

    expect(assinatura).toMatch(/^[\w-]{43}$/);
    expect(signer.sign(ID, expira)).toBe(assinatura);
    expect(signer.sign(ID, expira + 1)).not.toBe(assinatura);
    expect(new UrlSigner('outro-segredo-com-tamanho-suficiente-000').sign(ID, expira)).not.toBe(
      assinatura,
    );
  });

  it('valida, expira e recusa assinatura adulterada', () => {
    const assinatura = signer.sign(ID, expira);

    expect(signer.verify(ID, expira, assinatura, agora)).toBe('valido');
    expect(signer.verify(ID, expira, assinatura, agora + 61_000)).toBe('expirado');
    expect(signer.verify(ID, expira + 3600, assinatura, agora)).toBe('invalido');
    expect(signer.verify('outro-id', expira, assinatura, agora)).toBe('invalido');
    expect(signer.verify(ID, expira, 'curta', agora)).toBe('invalido');
  });
});
