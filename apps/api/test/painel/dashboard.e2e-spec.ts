import { fakerPT_BR as faker } from '@faker-js/faker';
import type { INestApplication } from '@nestjs/common';
import {
  ABAS_PAINEL,
  apiErrorSchema,
  dashboardPainelSchema,
  type SecaoPainel,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';

const BASE = '/api/painel/dashboard';

function valorDoKpi(secoes: SecaoPainel[], id: string): number | null | undefined {
  for (const bloco of secoes.flatMap((s) => s.blocos)) {
    if (bloco.tipo === 'kpi' && bloco.id === id) return bloco.valor;
  }
  return undefined;
}

describe('Painel: dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: ['painel.painel.ver'] });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = (quem: UsuarioTeste = usuario) => comUsuario(app, quem);

  it.each(ABAS_PAINEL)('GET /%s: 200 com o contrato da aba', async (aba) => {
    const res = await http().get(`${BASE}/${aba}`).query({ mes: '2026-10' }).expect(200);

    const dashboard = dashboardPainelSchema.parse(res.body);
    expect(dashboard).toMatchObject({
      aba,
      periodo: { de: '2026-10-01', ate: '2026-10-31' },
      base: 'recebimento',
    });
  });

  it('sem filtros: mês atual e base recebimento', async () => {
    const res = await http().get(`${BASE}/executivo`).expect(200);

    const { periodo, base } = dashboardPainelSchema.parse(res.body);
    expect(periodo.de).toMatch(/^\d{4}-\d{2}-01$/);
    expect(base).toBe('recebimento');
  });

  it('por período e base competência', async () => {
    const res = await http()
      .get(`${BASE}/financeiro`)
      .query({ modo: 'periodo', de: '2026-09-15', ate: '2026-10-05', base: 'competencia' })
      .expect(200);

    expect(res.body).toMatchObject({
      periodo: { de: '2026-09-15', ate: '2026-10-05' },
      base: 'competencia',
    });
  });

  it('Médicos Ativos conta só profissionais ativos e não excluídos', async () => {
    await prisma.profissional.createMany({
      data: [
        { nome: faker.person.fullName() },
        { nome: faker.person.fullName() },
        { nome: faker.person.fullName(), ativo: false },
        { nome: faker.person.fullName(), deletedAt: new Date() },
      ],
    });

    const res = await http().get(`${BASE}/comercial`).expect(200);

    expect(valorDoKpi(dashboardPainelSchema.parse(res.body).secoes, 'medicos-ativos')).toBe(2);
  });

  it('Total Pacientes conta os não excluídos, ativos ou inativos', async () => {
    await prisma.paciente.createMany({
      data: [
        { nome: faker.person.fullName() },
        { nome: faker.person.fullName(), status: 'INATIVO' },
        { nome: faker.person.fullName(), deletedAt: new Date() },
      ],
    });

    const res = await http().get(`${BASE}/pacientes`).expect(200);

    expect(valorDoKpi(dashboardPainelSchema.parse(res.body).secoes, 'total-pacientes')).toBe(2);
  });

  describe('erros', () => {
    it('400 em aba desconhecida', async () => {
      const res = await http().get(`${BASE}/outra`).expect(400);

      expect(apiErrorSchema.parse(res.body).code).toBe('VALIDATION_ERROR');
    });

    it('400 em mês, modo e período inválidos, com o campo nos details', async () => {
      const mes = await http().get(`${BASE}/executivo`).query({ mes: '2026-13' }).expect(400);
      const periodo = await http()
        .get(`${BASE}/executivo`)
        .query({ modo: 'periodo', de: '2026-10-20', ate: '2026-10-10' })
        .expect(400);
      const faltando = await http().get(`${BASE}/executivo`).query({ modo: 'periodo' }).expect(400);

      expect(apiErrorSchema.parse(mes.body).details).toEqual([
        { field: 'mes', message: 'Mês inválido' },
      ]);
      expect(apiErrorSchema.parse(periodo.body).details?.[0]?.field).toBe('ate');
      expect(apiErrorSchema.parse(faltando.body).details?.map((d) => d.field)).toEqual([
        'de',
        'ate',
      ]);
    });

    it('401 sem login', async () => {
      await request(app.getHttpServer()).get(`${BASE}/executivo`).expect(401);
    });

    it('403 sem painel.painel.ver', async () => {
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });

      const res = await http(semPermissao).get(`${BASE}/executivo`).expect(403);

      expect(apiErrorSchema.parse(res.body).statusCode).toBe(403);
    });
  });
});
