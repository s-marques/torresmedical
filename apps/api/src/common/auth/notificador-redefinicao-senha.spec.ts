import { NotificadorRedefinicaoSenhaPendente } from './notificador-redefinicao-senha';

describe('NotificadorRedefinicaoSenhaPendente', () => {
  it('termina sem erro e sem expor o token', async () => {
    const notificador = new NotificadorRedefinicaoSenhaPendente();
    const warn = jest.spyOn(notificador['logger'], 'warn').mockImplementation(() => undefined);

    await expect(
      notificador.enviar({ usuarioId: 'u1', token: 'segredo', expiraEm: new Date() }),
    ).resolves.toBeUndefined();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('segredo');
  });
});
