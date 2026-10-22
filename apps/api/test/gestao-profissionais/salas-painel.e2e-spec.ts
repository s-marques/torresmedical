import type { INestApplication } from '@nestjs/common';
import { salaDashboardSchema, salaOcupacaoSchema, salaPageSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';

const BASE = '/api/gestao-profissionais/salas';
const PERMISSOES = ['gestao-profissionais.salas.ver'] as const;
/** Quinta-feira. A semana vai de 2026-10-19 (segunda) a 2026-10-25 (domingo). */
const HOJE = '2026-10-22';

describe('Mapa de Ocupação, Dashboard e locatários dos cards (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let profissionalId: string;
  let pacienteId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    profissionalId = (await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste' } })).id;
    pacienteId = (await prisma.paciente.create({ data: { nome: 'Bruno Cliente Teste' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const sala = (nome: string, extra: Record<string, unknown> = {}) =>
    prisma.sala.create({ data: { nome, ...extra } });

  function contrato(
    salaId: string,
    extra: Record<string, unknown> = {},
    dias: Array<[number, string, string]> = [],
  ) {
    return prisma.contratoSala.create({
      data: {
        salaId,
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId,
        valorUnitario: 1000,
        dataInicio: new Date('2026-09-01T00:00:00Z'),
        dias: {
          create: dias.map(([diaSemana, inicio, fim]) => ({ diaSemana, inicio, fim })),
        },
        ...extra,
      },
    });
  }

  describe('GET /ocupacao', () => {
    it('semana de segunda a domingo com os blocos de cada sala, em ordem natural', async () => {
      const s10 = await sala('Sala 10');
      const s2 = await sala('Sala 2');
      await sala('Sala 1');
      await contrato(s2.id, {}, [
        [2, '14:00', '18:00'],
        [4, '08:00', '12:00'],
      ]);
      await contrato(s10.id, { locatarioTipo: 'CLIENTE', profissionalId: null, pacienteId }, [
        [0, '09:00', '10:00'],
      ]);

      const res = salaOcupacaoSchema.parse(
        (await http().get(`${BASE}/ocupacao`).query({ inicio: HOJE }).expect(200)).body,
      );

      expect(res.inicio).toBe('2026-10-19');
      expect(res.fim).toBe('2026-10-25');
      expect(res.salas.map((s) => s.salaNome)).toEqual(['Sala 1', 'Sala 2', 'Sala 10']);
      expect(res.salas[0]?.blocos).toEqual([]);
      expect(res.salas[1]?.blocos.map((b) => [b.data, b.locatarioNome, b.inicio, b.fim])).toEqual([
        ['2026-10-20', 'Dra. Ana Teste', '14:00', '18:00'],
        ['2026-10-22', 'Dra. Ana Teste', '08:00', '12:00'],
      ]);
      expect(res.salas[2]?.blocos.map((b) => [b.data, b.locatarioNome])).toEqual([
        ['2026-10-25', 'Bruno Cliente Teste'],
      ]);
    });

    it('só contratos ativos e dentro da vigência; dois contratos no mesmo dia aparecem os dois', async () => {
      const s = await sala('Sala 11');
      await contrato(s.id, {}, [[4, '08:00', '12:00']]);
      await contrato(s.id, {}, [[4, '08:00', '12:00']]);
      await contrato(s.id, { status: 'CANCELADO' }, [[4, '13:00', '14:00']]);
      await contrato(s.id, { status: 'ENCERRADO' }, [[4, '15:00', '16:00']]);
      await contrato(s.id, { deletedAt: new Date() }, [[4, '17:00', '18:00']]);
      await contrato(s.id, { dataInicio: new Date('2026-10-21T00:00:00Z') }, [
        [1, '06:00', '07:00'],
      ]);
      await contrato(s.id, { dataFim: new Date('2026-10-20T00:00:00Z') }, [[5, '06:00', '07:00']]);
      await contrato(s.id, { dataInicio: new Date('2026-10-22T00:00:00Z') }, [
        [4, '19:00', '20:00'],
      ]);

      const res = await http().get(`${BASE}/ocupacao`).query({ inicio: '2026-10-19' }).expect(200);

      const blocos = res.body.salas[0].blocos as Array<{ data: string; inicio: string }>;
      expect(blocos.map((b) => [b.data, b.inicio])).toEqual([
        ['2026-10-22', '08:00'],
        ['2026-10-22', '08:00'],
        ['2026-10-22', '19:00'],
      ]);
    });

    it('semana seguinte e padrão (semana de hoje); sala excluída não aparece', async () => {
      const s = await sala('Sala 1');
      await sala('Sala 2', { deletedAt: new Date() });
      await contrato(s.id, {}, [[1, '08:00', '09:00']]);

      const proxima = await http()
        .get(`${BASE}/ocupacao`)
        .query({ inicio: '2026-10-26' })
        .expect(200);
      expect(proxima.body).toMatchObject({ inicio: '2026-10-26', fim: '2026-11-01' });
      expect(proxima.body.salas).toHaveLength(1);
      expect(proxima.body.salas[0].blocos[0].data).toBe('2026-10-26');
      const padrao = await http().get(`${BASE}/ocupacao`).expect(200);
      expect(padrao.body.inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('400 para data inválida e 403 sem permissão', async () => {
      await http().get(`${BASE}/ocupacao`).query({ inicio: '22/10/2026' }).expect(400);
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(`${BASE}/ocupacao`).expect(403);
    });
  });

  describe('GET /dashboard', () => {
    it('total, ocupadas, disponíveis, taxa e receita por sala (valor total mensal, sem permuta)', async () => {
      const s1 = await sala('Sala 1');
      const s2 = await sala('Sala 2');
      const s10 = await sala('Sala 10');
      const s11 = await sala('Sala 11');
      await contrato(s2.id, { valorUnitario: 6750 });
      await contrato(s10.id, { modalidade: 'TURNO', valorUnitario: 870, quantidadeMensal: 2 });
      await contrato(s10.id, { modalidade: 'HORA', valorUnitario: 87.5, quantidadeMensal: 4 });
      await contrato(s10.id, { permuta: true, valorUnitario: 500 });
      await contrato(s11.id, { status: 'CANCELADO' });
      await contrato(s1.id, { dataInicio: new Date('2026-10-23T00:00:00Z') });

      const res = salaDashboardSchema.parse(
        (await http().get(`${BASE}/dashboard`).query({ data: HOJE }).expect(200)).body,
      );

      expect(res).toMatchObject({
        data: HOJE,
        totalSalas: 4,
        ocupadas: 2,
        disponiveis: 2,
        taxaOcupacao: 50,
        receitaMensalTotal: 8840,
      });
      expect(res.receitaPorSala.map((s) => [s.salaNome, s.valor])).toEqual([
        ['Sala 2', 6750],
        ['Sala 10', 2090],
        ['Sala 1', 0],
        ['Sala 11', 0],
      ]);
    });

    it('taxa com uma casa decimal e zero sem salas', async () => {
      const vazio = await http().get(`${BASE}/dashboard`).query({ data: HOJE }).expect(200);
      expect(vazio.body).toMatchObject({ totalSalas: 0, taxaOcupacao: 0, receitaMensalTotal: 0 });

      const salas = await Promise.all([sala('A'), sala('B'), sala('C')]);
      await contrato((salas[0] as { id: string }).id);
      const res = await http().get(`${BASE}/dashboard`).query({ data: HOJE }).expect(200);
      expect(res.body.taxaOcupacao).toBe(33.3);
    });

    it('400 para data inválida, 403 sem permissão e o padrão é hoje', async () => {
      await http().get(`${BASE}/dashboard`).query({ data: 'x' }).expect(400);
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(`${BASE}/dashboard`).expect(403);
      const padrao = await http().get(`${BASE}/dashboard`).expect(200);
      expect(padrao.body.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('GET / (cards da aba Salas)', () => {
    it('traz os locatários de hoje com o valor total mensal e marca a sala como ocupada', async () => {
      const ocupada = await sala('Sala 7');
      const livre = await sala('Sala 8');
      await contrato(ocupada.id, { modalidade: 'TURNO', valorUnitario: 870, quantidadeMensal: 2 });
      await contrato(ocupada.id, {
        locatarioTipo: 'CLIENTE',
        profissionalId: null,
        pacienteId,
        valorUnitario: 1160,
      });
      await contrato(ocupada.id, { status: 'ENCERRADO' });
      await contrato(livre.id, { dataFim: new Date('2026-09-30T00:00:00Z') });

      const res = salaPageSchema.parse((await http().get(BASE).expect(200)).body);

      const s7 = res.data.find((s) => s.nome === 'Sala 7');
      const s8 = res.data.find((s) => s.nome === 'Sala 8');
      expect(s7).toMatchObject({ ocupada: true });
      expect(s7?.locatarios.map((l) => [l.nome, l.valorTotalMensal])).toEqual([
        ['Dra. Ana Teste', 1740],
        ['Bruno Cliente Teste', 1160],
      ]);
      expect(s8).toMatchObject({ ocupada: false, locatarios: [] });
    });
  });
});
