import type { ClsService } from 'nestjs-cls';
import { ProfissionaisClassificacaoAgendador } from './profissionais-classificacao.agendador';
import type { ProfissionaisClassificacaoService } from './profissionais-classificacao.service';

const AGORA = new Date('2026-11-24T06:00:00.000Z');

function montar(recalcular: jest.Mock) {
  const cls = { run: jest.fn((fn: () => unknown) => fn()) };
  const classificacao = { recalcular };
  const agendador = new ProfissionaisClassificacaoAgendador(
    cls as unknown as ClsService,
    classificacao as unknown as ProfissionaisClassificacaoService,
  );
  return { agendador, cls, recalcular };
}

describe('ProfissionaisClassificacaoAgendador', () => {
  afterEach(() => {
    delete process.env.CAMPANHAS_AGENDADOR;
  });

  it('rodar: reclassifica todos, no contexto da rodada, com o relógio recebido', async () => {
    const { agendador, cls, recalcular } = montar(
      jest.fn().mockResolvedValue({ avaliados: 3, alterados: 1 }),
    );

    await agendador.rodar(AGORA);

    expect(cls.run).toHaveBeenCalledTimes(1);
    expect(recalcular).toHaveBeenCalledWith(AGORA);
  });

  it('rodar: erro no cálculo não derruba a rodada (só é registrado)', async () => {
    const { agendador } = montar(jest.fn().mockRejectedValue(new Error('banco fora')));

    await expect(agendador.rodar(AGORA)).resolves.toBeUndefined();
  });

  it('todoDia: roda quando o agendador está ligado', async () => {
    const { agendador, recalcular } = montar(
      jest.fn().mockResolvedValue({ avaliados: 0, alterados: 0 }),
    );

    await agendador.todoDia();

    expect(recalcular).toHaveBeenCalledTimes(1);
  });

  it('todoDia: CAMPANHAS_AGENDADOR=off desliga', async () => {
    process.env.CAMPANHAS_AGENDADOR = 'off';
    const { agendador, recalcular } = montar(jest.fn());

    await agendador.todoDia();

    expect(recalcular).not.toHaveBeenCalled();
  });

  it('todoDia: não sobrepõe uma rodada que ainda está em andamento', async () => {
    let liberar: () => void = () => undefined;
    const { agendador, recalcular } = montar(
      jest.fn().mockReturnValue(new Promise<void>((resolve) => (liberar = resolve))),
    );

    const primeira = agendador.todoDia();
    await agendador.todoDia();
    liberar();
    await primeira;

    expect(recalcular).toHaveBeenCalledTimes(1);
  });
});
