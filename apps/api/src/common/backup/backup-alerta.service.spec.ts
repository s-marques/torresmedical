import { Logger } from '@nestjs/common';
import { BackupAlertaService } from './backup-alerta.service';
import type { BackupConfig } from './backup.config';

const CONFIG: BackupConfig = {
  ativo: true,
  chave: 'x'.repeat(32),
  retencao: { diarios: 7, semanais: 4, mensais: 6 },
  databaseUrl: 'postgresql://u:p@h/db',
};

describe('BackupAlertaService', () => {
  let erroLog: jest.SpyInstance;
  let fetchFalso: jest.Mock;
  const fetchOriginal = global.fetch;

  beforeEach(() => {
    erroLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    fetchFalso = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchFalso as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it('sempre grava o log de erro com o marcador do alerta', async () => {
    await new BackupAlertaService(CONFIG).falha('BACKUP', 'BACKUP_DUMP_FALHOU', 'e1');
    expect(erroLog).toHaveBeenCalledWith(
      { alerta: 'BACKUP_FALHOU', tipo: 'BACKUP', codigo: 'BACKUP_DUMP_FALHOU', execucaoId: 'e1' },
      'Falha no backup',
    );
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('avisa o webhook com tipo, código e id, sem dados do banco', async () => {
    const service = new BackupAlertaService({
      ...CONFIG,
      alertaWebhookUrl: 'https://alerta.test/h',
    });
    await service.falha('RESTAURACAO_TESTE', 'RESTAURACAO_FALHOU', 'e2');
    const [url, opcoes] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://alerta.test/h');
    expect(opcoes.method).toBe('POST');
    expect(JSON.parse(opcoes.body as string)).toMatchObject({
      evento: 'backup.falhou',
      tipo: 'RESTAURACAO_TESTE',
      codigo: 'RESTAURACAO_FALHOU',
      execucaoId: 'e2',
    });
  });

  it('registra no log, sem lançar, quando o webhook recusa ou está fora do ar', async () => {
    const service = new BackupAlertaService({
      ...CONFIG,
      alertaWebhookUrl: 'https://alerta.test/h',
    });
    fetchFalso.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(service.falha('BACKUP', 'BACKUP_ENVIO_FALHOU', 'e3')).resolves.toBeUndefined();
    expect(erroLog).toHaveBeenCalledWith({ status: 500 }, 'O webhook de alerta recusou o aviso');

    fetchFalso.mockRejectedValueOnce(new TypeError('segredo na mensagem'));
    await expect(service.falha('BACKUP', 'BACKUP_ENVIO_FALHOU', 'e4')).resolves.toBeUndefined();
    expect(JSON.stringify(erroLog.mock.calls)).not.toContain('segredo');
  });
});
