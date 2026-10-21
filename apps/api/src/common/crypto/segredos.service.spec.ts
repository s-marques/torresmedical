import { SegredosService } from './segredos.service';

const SEGREDO = 'a'.repeat(32);

describe('SegredosService', () => {
  it('cifra e decifra, sem guardar o texto puro', () => {
    const service = new SegredosService({ SECRETS_ENCRYPTION_KEY: SEGREDO });
    const cifrado = service.cifrar('token-de-teste');
    expect(cifrado.startsWith('v1:')).toBe(true);
    expect(cifrado).not.toContain('token-de-teste');
    expect(service.decifrar(cifrado)).toBe('token-de-teste');
  });

  it('gera um valor diferente a cada cifragem (IV aleatório)', () => {
    const service = new SegredosService({ SECRETS_ENCRYPTION_KEY: SEGREDO });
    expect(service.cifrar('x')).not.toBe(service.cifrar('x'));
  });

  it('usa AUTH_JWT_SECRET quando SECRETS_ENCRYPTION_KEY não existe', () => {
    const service = new SegredosService({ AUTH_JWT_SECRET: SEGREDO });
    expect(service.decifrar(service.cifrar('abc'))).toBe('abc');
  });

  it('não decifra com outra chave nem com valor fora do formato', () => {
    const cifrado = new SegredosService({ SECRETS_ENCRYPTION_KEY: SEGREDO }).cifrar('abc');
    const outra = new SegredosService({ SECRETS_ENCRYPTION_KEY: 'b'.repeat(32) });
    expect(outra.decifrar(cifrado)).toBeNull();
    expect(outra.decifrar('texto-puro')).toBeNull();
  });

  it('falha sem segredo configurado', () => {
    expect(() => new SegredosService({}).cifrar('x')).toThrow('SECRETS_ENCRYPTION_KEY');
  });
});
