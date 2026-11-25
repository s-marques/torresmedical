import { Logger } from '@nestjs/common';
import { BackupAgendador } from './backup.agendador';
import type { BackupService } from './backup.service';

function montar(ativo: boolean, disparar = jest.fn()) {
  const backup = { ativo, disparar } as unknown as BackupService;
  return { agendador: new BackupAgendador(backup), disparar };
}

describe('BackupAgendador', () => {
  afterEach(() => jest.restoreAllMocks());

  it('não faz nada com o backup desativado', async () => {
    const { agendador, disparar } = montar(false);
    await agendador.backupDiario();
    await agendador.restauracaoSemanal();
    expect(disparar).not.toHaveBeenCalled();
  });

  it('dispara o backup diário e espera o fim do job', async () => {
    let terminou = false;
    const concluida = Promise.resolve().then(() => {
      terminou = true;
    });
    const { agendador, disparar } = montar(true, jest.fn().mockResolvedValue({ concluida }));
    await agendador.backupDiario();
    expect(disparar).toHaveBeenCalledWith('BACKUP', 'AGENDADO');
    expect(terminou).toBe(true);
  });

  it('dispara a restauração de teste semanal', async () => {
    const { agendador, disparar } = montar(
      true,
      jest.fn().mockResolvedValue({ concluida: Promise.resolve() }),
    );
    await agendador.restauracaoSemanal();
    expect(disparar).toHaveBeenCalledWith('RESTAURACAO_TESTE', 'AGENDADO');
  });

  it('registra no log, sem lançar, quando a execução não inicia', async () => {
    const erroLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { agendador } = montar(true, jest.fn().mockRejectedValue(new Error('já executando')));
    await expect(agendador.backupDiario()).resolves.toBeUndefined();
    expect(erroLog).toHaveBeenCalledWith(
      { tipo: 'BACKUP', erro: 'Error' },
      'Execução agendada não iniciou',
    );
  });
});
