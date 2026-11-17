import {
  COMANDO_PREPARAR_AUTOMACAO,
  COMANDO_PREPARAR_CAMPANHA,
  EnviosCampanhaService,
} from './envios-campanha.service';
import { agoraNaClinica } from './relogio-clinica';

const CAMPANHA = '00000000-0000-4000-8000-0000000000a1';
const AUTOMACAO = '00000000-0000-4000-8000-0000000000b1';
const CANAL = '00000000-0000-4000-8000-0000000000c1';
const P1 = '00000000-0000-4000-8000-0000000000d1';
const P2 = '00000000-0000-4000-8000-0000000000d2';

// 17/11/2026 12:00 UTC = 09:00 em São Paulo, terça-feira.
const AGORA = agoraNaClinica(new Date('2026-11-17T12:00:00.000Z'));

function montar(dados: Partial<Record<string, unknown>> = {}) {
  const tx = {
    campanha: {
      findMany: jest.fn(async (..._args: unknown[]) => dados.campanhas ?? []),
      findFirst: jest.fn(async (..._args: unknown[]) => dados.campanha ?? null),
      updateMany: jest.fn(async (..._args: unknown[]) => ({
        count: (dados.count as number | undefined) ?? 1,
      })),
      update: jest.fn(async (..._args: unknown[]) => ({})),
    },
    mensagemAutomatica: {
      findMany: jest.fn(async (..._args: unknown[]) => dados.automacoes ?? []),
      findFirst: jest.fn(async (..._args: unknown[]) => dados.automacao ?? null),
      updateMany: jest.fn(async (..._args: unknown[]) => ({
        count: (dados.count as number | undefined) ?? 1,
      })),
      update: jest.fn(async (..._args: unknown[]) => ({})),
    },
    envioCampanha: {
      count: jest.fn(
        async (..._args: unknown[]) => (dados.enviosExistentes as number | undefined) ?? 0,
      ),
      createMany: jest.fn(async (..._args: unknown[]) => ({ count: 0 })),
      findMany: jest.fn(async (..._args: unknown[]) => dados.envios ?? []),
      update: jest.fn(async (..._args: unknown[]) => ({})),
    },
  };
  const destinatarios = {
    ids: jest.fn(async (..._args: unknown[]) => (dados.ids as string[] | undefined) ?? [P1, P2]),
    dados: jest.fn(
      async () =>
        new Map([
          [P1, { nome: 'Ana Teste', celular: '65999990000', ultimaCompra: '10/11/2026' }],
          [P2, { nome: 'Bia Teste', celular: null, ultimaCompra: null }],
        ]),
    ),
  };
  const whatsapp = { registrar: jest.fn(async (..._args: unknown[]) => 'mensagem-1') };
  const events = { publish: jest.fn(async (..._args: unknown[]) => undefined) };
  const audit = { record: jest.fn(async (..._args: unknown[]) => undefined) };
  const service = new EnviosCampanhaService(
    { tx } as never,
    destinatarios as never,
    whatsapp as never,
    events as never,
    audit as never,
  );
  return { service, tx, destinatarios, whatsapp, events, audit };
}

describe('EnviosCampanhaService', () => {
  describe('disparos do agendador', () => {
    it('campanha devida vira "Enviando", é auditada e pede a preparação', async () => {
      const { service, tx, events, audit } = montar({ campanhas: [{ id: CAMPANHA }] });
      expect(await service.dispararCampanhas(AGORA)).toBe(1);
      expect(tx.campanha.updateMany).toHaveBeenCalledWith({
        where: { id: CAMPANHA, status: 'AGENDADA' },
        data: { status: 'ENVIANDO', iniciadaEm: AGORA.instante },
      });
      expect(events.publish).toHaveBeenCalledWith(COMANDO_PREPARAR_CAMPANHA, {
        campanhaId: CAMPANHA,
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'Campanha', after: { status: 'ENVIANDO' } }),
      );
    });

    it('se outra instância já mudou o status, não publica de novo', async () => {
      const { service, events } = montar({ campanhas: [{ id: CAMPANHA }], count: 0 });
      expect(await service.dispararCampanhas(AGORA)).toBe(0);
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('automação do dia e do horário sai uma vez por dia', async () => {
      const { service, tx, events } = montar({ automacoes: [{ id: AUTOMACAO }] });
      expect(await service.dispararAutomacoes(AGORA)).toBe(1);
      expect(tx.mensagemAutomatica.findMany.mock.calls[0]?.[0]).toMatchObject({
        where: { ativa: true, diasSemana: { has: 2 }, horario: { lte: '09:00' } },
      });
      expect(tx.mensagemAutomatica.updateMany.mock.calls[0]?.[0]).toMatchObject({
        data: { ultimaExecucaoDia: new Date('2026-11-17T00:00:00.000Z') },
      });
      expect(events.publish).toHaveBeenCalledWith(COMANDO_PREPARAR_AUTOMACAO, {
        mensagemAutomaticaId: AUTOMACAO,
        dia: '2026-11-17',
      });
    });
  });

  describe('preparação (consumidor)', () => {
    const campanha = (extra: Record<string, unknown> = {}) => ({
      id: CAMPANHA,
      status: 'ENVIANDO',
      filtro: 'TODOS',
      origemClienteId: null,
      diasCompra: null,
      quantidade: 2,
      intervaloSegundos: 10,
      agendadaPara: new Date('2026-11-17T11:00:00.000Z'),
      ...extra,
    });

    it('programa os destinatários espaçados pelo intervalo, até a quantidade', async () => {
      const { service, tx, destinatarios } = montar({ campanha: campanha() });
      await service.prepararCampanha(CAMPANHA, AGORA);
      expect(destinatarios.ids).toHaveBeenCalledWith(expect.anything(), AGORA, 2);
      expect(tx.envioCampanha.createMany).toHaveBeenCalledWith({
        data: [
          { campanhaId: CAMPANHA, pacienteId: P1, programadoPara: AGORA.instante },
          {
            campanhaId: CAMPANHA,
            pacienteId: P2,
            programadoPara: new Date(AGORA.instante.getTime() + 10_000),
          },
        ],
        skipDuplicates: true,
      });
      expect(tx.campanha.update).not.toHaveBeenCalled();
    });

    it('idempotente: ignora campanha já preparada, cancelada ou inexistente', async () => {
      for (const dados of [
        { campanha: campanha(), enviosExistentes: 3 },
        { campanha: campanha({ status: 'CANCELADA' }) },
        { campanha: null },
      ]) {
        const { service, tx } = montar(dados);
        await service.prepararCampanha(CAMPANHA, AGORA);
        expect(tx.envioCampanha.createMany).not.toHaveBeenCalled();
      }
    });

    it('sem destinatários, a campanha conclui', async () => {
      const { service, tx } = montar({ campanha: campanha(), ids: [] });
      await service.prepararCampanha(CAMPANHA, AGORA);
      expect(tx.campanha.update).toHaveBeenCalledWith({
        where: { id: CAMPANHA },
        data: { status: 'CONCLUIDA', concluidaEm: AGORA.instante },
      });
    });

    it('automação ativa programa os destinatários do dia; inativa não', async () => {
      const ativa = montar({ automacao: { id: AUTOMACAO, ativa: true, filtro: 'TODOS' } });
      await ativa.service.prepararAutomacao(AUTOMACAO, '2026-11-17', AGORA);
      expect(ativa.tx.envioCampanha.createMany.mock.calls[0]?.[0]).toMatchObject({
        data: [
          { mensagemAutomaticaId: AUTOMACAO, pacienteId: P1, dia: new Date('2026-11-17') },
          { mensagemAutomaticaId: AUTOMACAO, pacienteId: P2 },
        ],
        skipDuplicates: true,
      });

      const inativa = montar({ automacao: { id: AUTOMACAO, ativa: false } });
      await inativa.service.prepararAutomacao(AUTOMACAO, '2026-11-17', AGORA);
      expect(inativa.tx.envioCampanha.createMany).not.toHaveBeenCalled();
    });
  });

  describe('enfileirar', () => {
    const envio = (extra: Record<string, unknown> = {}) => ({
      id: 'envio-1',
      pacienteId: P1,
      mensagemAutomaticaId: null,
      campanha: {
        mensagem: 'Oi {nome}, sua última compra foi {ultima_compra}.',
        canalId: CANAL,
        status: 'ENVIANDO',
        deletedAt: null,
      },
      mensagemAutomatica: null,
      ...extra,
    });

    it('grava a mensagem com as variáveis trocadas e marca o envio', async () => {
      const { service, whatsapp, tx } = montar({ envios: [envio()] });
      expect(await service.enfileirar(AGORA)).toBe(1);
      expect(whatsapp.registrar).toHaveBeenCalledWith({
        canalId: CANAL,
        pacienteId: P1,
        nome: 'Ana Teste',
        telefone: '65999990000',
        conteudo: 'Oi Ana Teste, sua última compra foi 10/11/2026.',
      });
      expect(tx.envioCampanha.update).toHaveBeenCalledWith({
        where: { id: 'envio-1' },
        data: {
          status: 'ENFILEIRADO',
          mensagemWhatsappId: 'mensagem-1',
          enfileiradoEm: AGORA.instante,
        },
      });
    });

    it('cancela envio de campanha cancelada e marca falha sem celular', async () => {
      const { service, whatsapp, tx } = montar({
        envios: [
          envio({ campanha: { ...envio().campanha, status: 'CANCELADA' } }),
          envio({ id: 'envio-2', pacienteId: P2 }),
        ],
      });
      expect(await service.enfileirar(AGORA)).toBe(0);
      expect(whatsapp.registrar).not.toHaveBeenCalled();
      expect(tx.envioCampanha.update).toHaveBeenCalledWith({
        where: { id: 'envio-1' },
        data: { status: 'CANCELADO' },
      });
      expect(tx.envioCampanha.update).toHaveBeenCalledWith({
        where: { id: 'envio-2' },
        data: { status: 'FALHA', erro: 'SEM_CELULAR' },
      });
    });

    it('envio de automação atualiza o último envio; campanha sem pendentes conclui', async () => {
      const { service, tx, audit } = montar({
        envios: [
          envio({
            campanha: null,
            mensagemAutomaticaId: AUTOMACAO,
            mensagemAutomatica: {
              mensagem: 'Parabéns!',
              canalId: CANAL,
              ativa: true,
              deletedAt: null,
            },
          }),
        ],
        campanhas: [{ id: CAMPANHA }],
      });
      await service.enfileirar(AGORA);
      expect(tx.mensagemAutomatica.update).toHaveBeenCalledWith({
        where: { id: AUTOMACAO },
        data: { ultimoEnvioEm: AGORA.instante },
      });
      expect(tx.campanha.update).toHaveBeenCalledWith({
        where: { id: CAMPANHA },
        data: { status: 'CONCLUIDA', concluidaEm: AGORA.instante },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: CAMPANHA, after: { status: 'CONCLUIDA' } }),
      );
    });
  });
});
