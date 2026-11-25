import { AlertasAgendador } from './alertas.agendador';

const AGORA = new Date('2026-11-25T09:00:00Z');

function criar(temDoDia = false) {
  const cls = { run: jest.fn(async (fn: () => Promise<unknown>) => fn()) };
  const alertas = {
    recalcular: jest.fn(async () => ['CONTAS_PAGAR_VENCIDAS']),
    temDoDia: jest.fn(async () => temDoDia),
  };
  const agendador = new AlertasAgendador(cls as never, alertas as never);
  return { agendador, alertas, cls };
}

describe('AlertasAgendador', () => {
  const anterior = process.env.CAMPANHAS_AGENDADOR;
  beforeEach(() => {
    delete process.env.CAMPANHAS_AGENDADOR;
  });
  afterAll(() => {
    if (anterior === undefined) delete process.env.CAMPANHAS_AGENDADOR;
    else process.env.CAMPANHAS_AGENDADOR = anterior;
  });

  it('rodar recalcula dentro de um contexto próprio (fora de requisição)', async () => {
    const { agendador, alertas, cls } = criar();
    await agendador.rodar(AGORA);
    expect(cls.run).toHaveBeenCalledTimes(1);
    expect(alertas.recalcular).toHaveBeenCalledWith(AGORA);
  });

  it('um erro do recálculo é registrado e não derruba o processo', async () => {
    const { agendador, alertas } = criar();
    alertas.recalcular.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'P2002' }));
    await expect(agendador.rodar(AGORA)).resolves.toBeUndefined();
  });

  it('todoDia respeita o desligamento do agendador', async () => {
    process.env.CAMPANHAS_AGENDADOR = 'off';
    const { agendador, alertas } = criar();
    await agendador.todoDia();
    expect(alertas.recalcular).not.toHaveBeenCalled();
  });

  it('todoDia recalcula quando ligado', async () => {
    const { agendador, alertas } = criar();
    await agendador.todoDia();
    expect(alertas.recalcular).toHaveBeenCalledTimes(1);
  });

  it('na subida recalcula só se o dia ainda não tem contadores', async () => {
    const vazio = criar(false);
    await vazio.agendador.onApplicationBootstrap();
    expect(vazio.alertas.recalcular).toHaveBeenCalledTimes(1);

    const pronto = criar(true);
    await pronto.agendador.onApplicationBootstrap();
    expect(pronto.alertas.recalcular).not.toHaveBeenCalled();
  });

  it('na subida, com o agendador desligado, não consulta nem recalcula', async () => {
    process.env.CAMPANHAS_AGENDADOR = 'off';
    const { agendador, alertas } = criar();
    await agendador.onApplicationBootstrap();
    expect(alertas.temDoDia).not.toHaveBeenCalled();
  });

  it('na subida, falha ao consultar o dia é registrada sem derrubar a API', async () => {
    const { agendador, alertas } = criar();
    alertas.temDoDia.mockRejectedValueOnce(new Error('banco fora'));
    await expect(agendador.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
