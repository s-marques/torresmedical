import { hashSenha, verificarSenha } from './senhas';

describe('senhas', () => {
  it('gera hash argon2id que não contém a senha e confere a senha certa', async () => {
    const hash = await hashSenha('senha-certa-1');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('senha-certa-1');
    expect(await verificarSenha('senha-certa-1', hash)).toBe(true);
    expect(await verificarSenha('senha-errada-1', hash)).toBe(false);
  });

  it('sem hash (usuário inexistente ou sem senha) sempre recusa', async () => {
    expect(await verificarSenha('qualquer', null)).toBe(false);
    expect(await verificarSenha('qualquer', null)).toBe(false);
  });

  it('hash corrompido recusa, sem lançar erro', async () => {
    expect(await verificarSenha('qualquer', 'nao-e-um-hash')).toBe(false);
  });
});
