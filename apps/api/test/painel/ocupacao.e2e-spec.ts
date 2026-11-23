import type { INestApplication } from '@nestjs/common';
import {
  apiErrorSchema,
  dashboardPainelSchema,
  type DashboardPainel,
  type SecaoPainel,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectNoAudit } from '../utils/expect-audit';

const URL = '/api/painel/dashboard/ocupacao';
const PERMISSOES = ['painel.painel.ver'] as const;
/** Semana de segunda (19/10/2026) a domingo (25/10/2026); 22/10 é quinta-feira. */
const PERIODO = { modo: 'periodo', de: '2026-10-19', ate: '2026-10-25' } as const;
/** Horário de Brasília (UTC-3): 09:00 locais são 12:00 UTC. */
const QUINTA_09H = '2026-10-22T12:00:00Z';

function kpi(secoes: SecaoPainel[], id: string): number | null | undefined {
  for (const bloco of secoes.flatMap((s) => s.blocos)) {
    if (bloco.tipo === 'kpi' && bloco.id === id) return bloco.valor;
  }
  return undefined;
}

function linhas(secoes: SecaoPainel[], id: string) {
  for (const bloco of secoes.flatMap((s) => s.blocos)) {
    if (bloco.tipo === 'tabela' && bloco.id === id) return bloco.linhas;
  }
  return undefined;
}

describe('Painel: aba Ocupação (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = (u: UsuarioTeste = usuario) => comUsuario(app, u);
  const consultar = async (
    query: Record<string, string | number> = {},
    quem?: UsuarioTeste,
  ): Promise<DashboardPainel> =>
    dashboardPainelSchema.parse(
      (
        await http(quem)
          .get(URL)
          .query({ ...PERIODO, ...query })
          .expect(200)
      ).body,
    );

  const criarSala = (nome: string) => prisma.sala.create({ data: { nome } });
  const criarProfissional = (nome: string) =>
    prisma.profissional.create({ data: { nome, corCalendario: 'verde' } });

  function contrato(salaId: string, profissionalId: string, dia: [number, string, string]) {
    return prisma.contratoSala.create({
      data: {
        salaId,
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId,
        valorUnitario: 1500,
        dataInicio: new Date('2026-09-01T00:00:00Z'),
        dias: { create: [{ diaSemana: dia[0], inicio: dia[1], fim: dia[2] }] },
      },
    });
  }

  async function agendar(salaId: string, profissionalId: string, inicio: string, status: string) {
    const paciente = await prisma.paciente.create({ data: { nome: 'Paciente Teste' } });
    return prisma.agendamento.create({
      data: {
        pacienteId: paciente.id,
        profissionalId,
        salaId,
        inicio: new Date(inicio),
        duracaoMinutos: 60,
        status: status as 'ATENDIDO',
      },
    });
  }

  /**
   * Cenário conhecido: 2 salas × 7 dias × 3 turnos = 42 períodos.
   * - Ana contratou a Sala 1 na quinta de manhã e atendeu lá → utilizado;
   * - Bruno contratou a Sala 2 na quinta à tarde e não atendeu → contratado sem uso;
   * - Carla é profissional ativa, sem contrato nem atendimento.
   */
  async function montarCenario() {
    const [sala1, sala2] = [await criarSala('Sala 1'), await criarSala('Sala 2')];
    const [ana, bruno, carla] = [
      await criarProfissional('Dra. Ana Teste'),
      await criarProfissional('Dr. Bruno Teste'),
      await criarProfissional('Dra. Carla Teste'),
    ];
    await contrato(sala1.id, ana.id, [4, '08:00', '12:00']);
    await contrato(sala2.id, bruno.id, [4, '13:00', '17:00']);
    await agendar(sala1.id, ana.id, QUINTA_09H, 'ATENDIDO');
    return { sala1, sala2, ana, bruno, carla };
  }

  it('200 com o contrato do dashboard e sem gravar auditoria (somente leitura)', async () => {
    const d = await consultar();

    expect(d).toMatchObject({ aba: 'ocupacao', periodo: { de: '2026-10-19', ate: '2026-10-25' } });
    await expectNoAudit(prisma, { entity: 'Agendamento' });
  });

  it('sem salas: indicadores zerados, taxas sem valor e sem erro', async () => {
    const { secoes } = await consultar();

    expect(kpi(secoes, 'total-periodos')).toBe(0);
    expect(kpi(secoes, 'taxa-uso')).toBeNull();
    expect(linhas(secoes, 'ranking-ocupacao-por-sala')).toEqual([]);
  });

  it('cenário conhecido: capacidade, contratados, utilizados, sem uso e as duas taxas', async () => {
    await montarCenario();

    const { secoes } = await consultar();

    expect(kpi(secoes, 'total-periodos')).toBe(42);
    expect(kpi(secoes, 'contratados')).toBe(2);
    expect(kpi(secoes, 'utilizados')).toBe(1);
    expect(kpi(secoes, 'contratado-sem-uso')).toBe(1);
    expect(kpi(secoes, 'taxa-uso')).toBe(2.4);
    expect(kpi(secoes, 'taxa-contratacao')).toBe(4.8);
    // Ocupados: Ana (manhã) e Bruno (tarde) → 40 vagos de 42.
    expect(kpi(secoes, 'vacancia')).toBe(95.2);
    // Período já encerrado: a previsão é o realizado.
    expect(kpi(secoes, 'previsao-uso')).toBe(2.4);
  });

  it('profissional com contrato e sem atendimento aparece com 0% de uso; todos aparecem', async () => {
    await montarCenario();

    const tabela = linhas((await consultar()).secoes, 'ocupacao-por-profissional');

    expect(tabela).toEqual([
      expect.objectContaining({
        profissional: 'Dr. Bruno Teste',
        contratados: 1,
        utilizados: 0,
        uso: 0,
      }),
      expect.objectContaining({
        profissional: 'Dra. Ana Teste',
        contratados: 1,
        utilizados: 1,
        uso: 100,
      }),
      expect.objectContaining({
        profissional: 'Dra. Carla Teste',
        contratados: 0,
        utilizados: 0,
        uso: null,
      }),
    ]);
  });

  it('todas as salas aparecem no ranking, inclusive a sem uso', async () => {
    await montarCenario();
    await criarSala('Sala 3');

    const ranking = linhas((await consultar()).secoes, 'ranking-ocupacao-por-sala');

    expect(ranking?.map((l) => l.sala)).toEqual(['Sala 1', 'Sala 2', 'Sala 3']);
    expect(ranking?.[2]).toMatchObject({ contratados: 0, utilizados: 0, uso: 0 });
  });

  it('agendamento agendado, que faltou ou cancelado não conta como utilizado', async () => {
    const { sala1, ana } = await montarCenario();
    await agendar(sala1.id, ana.id, '2026-10-23T12:00:00Z', 'AGENDADO');
    await agendar(sala1.id, ana.id, '2026-10-24T12:00:00Z', 'FALTOU');
    await agendar(sala1.id, ana.id, '2026-10-25T12:00:00Z', 'CANCELADO');

    expect(kpi((await consultar()).secoes, 'utilizados')).toBe(1);
  });

  it('filtros por sala, turno, dia da semana e profissional', async () => {
    const { sala2, bruno } = await montarCenario();

    const porSala = (await consultar({ salaId: sala2.id })).secoes;
    expect(kpi(porSala, 'total-periodos')).toBe(21);
    expect(kpi(porSala, 'contratados')).toBe(1);

    const porTurno = (await consultar({ turno: 'TARDE' })).secoes;
    expect(kpi(porTurno, 'total-periodos')).toBe(14);
    expect(kpi(porTurno, 'contratados')).toBe(1);

    const porDia = (await consultar({ diaSemana: 4 })).secoes;
    expect(kpi(porDia, 'total-periodos')).toBe(6);
    expect(kpi(porDia, 'contratados')).toBe(2);

    const porProfissional = (await consultar({ profissionalId: bruno.id })).secoes;
    expect(kpi(porProfissional, 'contratados')).toBe(1);
    expect(kpi(porProfissional, 'utilizados')).toBe(0);
    expect(kpi(porProfissional, 'contratado-sem-uso')).toBe(1);
    // A capacidade e o vago continuam os da sala inteira.
    expect(kpi(porProfissional, 'total-periodos')).toBe(42);
    expect(linhas(porProfissional, 'ocupacao-por-profissional')).toHaveLength(1);
  });

  it('horários de maior demanda: por hora do dia', async () => {
    const { sala1, ana } = await montarCenario();
    await agendar(sala1.id, ana.id, '2026-10-23T12:00:00Z', 'AGENDADO');
    await agendar(sala1.id, ana.id, '2026-10-23T17:00:00Z', 'AGENDADO');

    const demanda = linhas((await consultar()).secoes, 'horarios-de-maior-demanda');

    expect(demanda).toEqual([
      { hora: '09h', agendamentos: 2, atendidos: 1 },
      { hora: '14h', agendamentos: 1, atendidos: 0 },
    ]);
  });

  it('compara com o mês anterior no detalhe dos indicadores', async () => {
    await montarCenario();

    const { secoes } = await consultar({ modo: 'mes', mes: '2026-10' });

    const bloco = secoes
      .flatMap((s) => s.blocos)
      .find((b) => b.tipo === 'kpi' && b.id === 'taxa-uso');
    expect(bloco?.tipo === 'kpi' && bloco.detalhe).toBe('mês anterior: 0%');
  });

  describe('escopo de dados (#153)', () => {
    it('restrito vê só a sala e os profissionais do vínculo', async () => {
      const { ana } = await montarCenario();
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [ana.id],
      });

      const { secoes } = await consultar({}, restrito);

      expect(linhas(secoes, 'ranking-ocupacao-por-sala')?.map((l) => l.sala)).toEqual(['Sala 1']);
      expect(linhas(secoes, 'ocupacao-por-profissional')?.map((l) => l.profissional)).toEqual([
        'Dra. Ana Teste',
      ]);
      expect(kpi(secoes, 'total-periodos')).toBe(21);
    });

    it('restrito sem vínculo não vê nada', async () => {
      await montarCenario();
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [],
      });

      const { secoes } = await consultar({}, restrito);

      expect(kpi(secoes, 'total-periodos')).toBe(0);
      expect(linhas(secoes, 'ocupacao-por-profissional')).toEqual([]);
    });

    it('403 ao filtrar pelo profissional de outro', async () => {
      const { ana, bruno } = await montarCenario();
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [ana.id],
      });

      const res = await http(restrito)
        .get(URL)
        .query({ ...PERIODO, profissionalId: bruno.id })
        .expect(403);

      expect(apiErrorSchema.parse(res.body).statusCode).toBe(403);
    });
  });

  describe('erros', () => {
    it('400 em sala, profissional, turno e dia da semana inválidos', async () => {
      const sala = await http()
        .get(URL)
        .query({ ...PERIODO, salaId: 'x' })
        .expect(400);
      const profissional = await http()
        .get(URL)
        .query({ ...PERIODO, profissionalId: 'x' })
        .expect(400);
      const turno = await http()
        .get(URL)
        .query({ ...PERIODO, turno: 'MADRUGADA' })
        .expect(400);
      const dia = await http()
        .get(URL)
        .query({ ...PERIODO, diaSemana: 9 })
        .expect(400);

      expect(apiErrorSchema.parse(sala.body).details?.[0]?.field).toBe('salaId');
      expect(apiErrorSchema.parse(profissional.body).details?.[0]?.field).toBe('profissionalId');
      expect(apiErrorSchema.parse(turno.body).details?.[0]?.field).toBe('turno');
      expect(apiErrorSchema.parse(dia.body).details?.[0]?.field).toBe('diaSemana');
    });

    it('403 sem painel.painel.ver', async () => {
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });

      await http(semPermissao).get(URL).query(PERIODO).expect(403);
    });

    it('401 sem login', async () => {
      const { default: request } = await import('supertest');

      await request(app.getHttpServer()).get(URL).query(PERIODO).expect(401);
    });
  });
});
