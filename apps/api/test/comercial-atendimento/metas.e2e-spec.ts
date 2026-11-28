import type { INestApplication } from '@nestjs/common';
import {
  acompanhamentoMetasSchema,
  metaComercialPageSchema,
  metaComercialSchema,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/metas';
const ENTITY = 'MetaComercial';
const PERMISSOES = [
  'comercial-atendimento.metas.ver',
  'comercial-atendimento.metas.criar',
  'comercial-atendimento.metas.editar',
  'comercial-atendimento.metas.excluir',
] as const;
const INEXISTENTE = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('Metas comerciais (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let pipelineId: string;
  let estagioId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    pipelineId = (await prisma.pipeline.create({ data: { nome: 'Pipeline Torres', ordem: 1 } })).id;
    estagioId = (
      await prisma.estagioPipeline.create({
        data: { pipelineId, nome: 'Contato inicial', cor: '#3b82f6', ordem: 1 },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const corpo = (extra: Record<string, unknown> = {}) => ({
    metrica: 'LEADS',
    periodoTipo: 'MES',
    periodo: '2026-11',
    valor: 40,
    ...extra,
  });
  const criar = async (extra: Record<string, unknown> = {}) =>
    metaComercialSchema.parse((await http().post(BASE).send(corpo(extra)).expect(201)).body);
  const responsavel = async (nome: string) => {
    const { id } = await criarUsuarioTeste(app);
    await prisma.usuario.update({ where: { id }, data: { nome } });
    return id;
  };
  const negocio = (data: Record<string, unknown> = {}) =>
    prisma.negocio.create({
      data: { titulo: 'Lead', pipelineId, estagioId, ...data },
    });

  describe('POST / (cadastro)', () => {
    it('201: grava o período, calcula as datas e audita', async () => {
      const meta = await criar({ periodoTipo: 'TRIMESTRE', periodo: '2026-T4', valor: 120 });

      expect(meta).toMatchObject({
        metrica: 'LEADS',
        periodo: '2026-T4',
        dataInicio: '2026-10-01',
        dataFim: '2026-12-31',
        responsavelId: null,
        valor: 120,
        realizado: 0,
        percentual: 0,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: meta.id,
        before: null,
        after: { metrica: 'LEADS', periodo: '2026-T4', valor: 120 },
        userId: usuario.id,
      });
    });

    it('400: período fora do tipo, valor negativo e métrica inválida; nada é auditado', async () => {
      for (const extra of [
        { periodoTipo: 'TRIMESTRE', periodo: '2026-11' },
        { periodo: '2026-13' },
        { valor: -1 },
        { metrica: 'OUTRA' },
      ]) {
        await http().post(BASE).send(corpo(extra)).expect(400);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('409: mesma métrica, período e responsável; outro responsável pode', async () => {
      const ana = await responsavel('Ana Teste');
      await criar({ responsavelId: ana });
      const res = await http()
        .post(BASE)
        .send(corpo({ responsavelId: ana }))
        .expect(409);
      expect(res.body.code).toBe('META_COMERCIAL_DUPLICADA');
      await criar({ responsavelId: await responsavel('Bia Teste') });
      await criar();
      await http().post(BASE).send(corpo()).expect(409);
    });

    it('recusa responsável inexistente', async () => {
      const res = await http()
        .post(BASE)
        .send(corpo({ responsavelId: INEXISTENTE }));
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('403 sem permissão', async () => {
      const semPermissao = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.metas.ver'],
      });
      await comUsuario(app, semPermissao).post(BASE).send(corpo()).expect(403);
    });
  });

  describe('realizado calculado do CRM', () => {
    it('conta leads, visitas, propostas e contratos no período, no dia da clínica', async () => {
      const ana = await responsavel('Ana Teste');
      const dentro = new Date('2026-11-10T15:00:00Z');
      // 30/11 às 23h no fuso da clínica é 01/12 02:00 UTC: ainda é novembro.
      const ultimoMomento = new Date('2026-12-01T02:59:00Z');
      // 01/12 00:00 no fuso da clínica: já é dezembro.
      const dezembro = new Date('2026-12-01T03:00:00Z');
      const outubro = new Date('2026-10-31T20:00:00Z');
      await negocio({
        responsavelId: ana,
        createdAt: dentro,
        marcoVisitaEm: dentro,
        marcoPropostaEm: dentro,
        marcoContratoEm: dentro,
      });
      await negocio({ responsavelId: ana, createdAt: ultimoMomento, marcoVisitaEm: ultimoMomento });
      await negocio({ responsavelId: ana, createdAt: dezembro, marcoVisitaEm: dezembro });
      await negocio({ responsavelId: ana, createdAt: outubro, marcoPropostaEm: outubro });
      // De outro responsável: só entra na meta da equipe.
      await negocio({ createdAt: dentro, marcoVisitaEm: dentro });
      // Excluído nunca conta.
      await negocio({ createdAt: dentro, marcoVisitaEm: dentro, deletedAt: new Date() });

      const leadsAna = await criar({ metrica: 'LEADS', responsavelId: ana, valor: 4 });
      const visitasAna = await criar({ metrica: 'VISITAS', responsavelId: ana, valor: 4 });
      const propostas = await criar({ metrica: 'PROPOSTAS', valor: 1 });
      const contratos = await criar({ metrica: 'CONTRATOS_FECHADOS', valor: 2 });
      const leadsEquipe = await criar({ metrica: 'LEADS', valor: 100 });

      expect([leadsAna.realizado, leadsAna.percentual]).toEqual([2, 50]);
      expect([visitasAna.realizado, visitasAna.percentual]).toEqual([2, 50]);
      expect([propostas.realizado, propostas.percentual]).toEqual([1, 100]);
      expect([contratos.realizado, contratos.percentual]).toEqual([1, 50]);
      expect([leadsEquipe.realizado, leadsEquipe.percentual]).toEqual([3, 3]);
    });

    it('receita nova soma só negócios ganhos fechados no período', async () => {
      const fechadoEm = new Date('2026-11-12T15:00:00Z');
      await negocio({ status: 'GANHO', valor: 1000, fechadoEm });
      await negocio({ status: 'GANHO', valor: 500.5, fechadoEm });
      await negocio({ status: 'GANHO', valor: 300, fechadoEm: new Date('2026-10-01T15:00:00Z') });
      await negocio({ status: 'ABERTO', valor: 999 });
      await negocio({ status: 'PERDIDO', valor: 777, fechadoEm });
      await negocio({ status: 'GANHO', valor: 50 });

      const meta = await criar({ metrica: 'RECEITA_NOVA', valor: 3000 });

      expect(meta.realizado).toBe(1500.5);
      expect(meta.percentual).toBe(50);
    });

    it('meta zerada não tem percentual', async () => {
      const meta = await criar({ valor: 0 });
      expect(meta.percentual).toBeNull();
    });
  });

  describe('GET / (listagem)', () => {
    it('200: filtra por métrica, responsável e período, ordena e pagina', async () => {
      const ana = await responsavel('Ana Teste');
      await criar({ metrica: 'LEADS', periodo: '2026-09', valor: 10 });
      await criar({ metrica: 'LEADS', periodo: '2026-11', valor: 20, responsavelId: ana });
      await criar({ metrica: 'VISITAS', periodoTipo: 'TRIMESTRE', periodo: '2026-T4', valor: 30 });

      const consulta = async (query: Record<string, string | number>) =>
        metaComercialPageSchema.parse((await http().get(BASE).query(query).expect(200)).body);

      const todas = await consulta({});
      expect(todas.meta).toMatchObject({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
      // Padrão: período mais recente primeiro.
      expect(todas.data.map((m) => m.periodo)).toEqual(['2026-11', '2026-T4', '2026-09']);
      expect(todas.data[0]).toMatchObject({ responsavel: 'Ana Teste', responsavelId: ana });

      expect((await consulta({ metrica: 'VISITAS' })).data).toHaveLength(1);
      expect((await consulta({ responsavelId: ana })).data.map((m) => m.valor)).toEqual([20]);
      // O trimestre T4 toca novembro; setembro não.
      expect((await consulta({ de: '2026-11-01', ate: '2026-11-30' })).data).toHaveLength(2);
      expect((await consulta({ de: '2026-12-01' })).data.map((m) => m.periodo)).toEqual([
        '2026-T4',
      ]);
      expect((await consulta({ sort: 'valor:asc' })).data.map((m) => m.valor)).toEqual([
        10, 20, 30,
      ]);
      const pagina = await consulta({ pageSize: 2, page: 2, sort: 'valor:asc' });
      expect(pagina.data.map((m) => m.valor)).toEqual([30]);
      await http().get(BASE).query({ sort: 'realizado:asc' }).expect(400);
    });

    it('não lista metas excluídas', async () => {
      const meta = await criar();
      await prisma.metaComercial.update({
        where: { id: meta.id },
        data: { deletedAt: new Date() },
      });
      expect((await http().get(BASE).expect(200)).body.data).toEqual([]);
    });

    it('403 sem permissão de ver', async () => {
      const sem = await criarUsuarioTeste(app);
      await comUsuario(app, sem).get(BASE).expect(403);
    });
  });

  describe('GET /responsaveis', () => {
    it('200: usuários ativos por nome; 403 sem permissão ou com escopo restrito', async () => {
      await responsavel('Zélia Teste');
      await responsavel('Ana Teste');
      const res = await http().get(`${BASE}/responsaveis`).expect(200);
      const nomes = (res.body as { nome: string }[]).map((r) => r.nome);
      expect(nomes).toEqual(expect.arrayContaining(['Ana Teste', 'Zélia Teste']));
      expect(nomes.indexOf('Ana Teste')).toBeLessThan(nomes.indexOf('Zélia Teste'));

      await comUsuario(app, await criarUsuarioTeste(app))
        .get(`${BASE}/responsaveis`)
        .expect(403);
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
      });
      await comUsuario(app, restrito).get(`${BASE}/responsaveis`).expect(403);
    });
  });

  describe('GET /acompanhamento', () => {
    it('totaliza por métrica e monta a evolução período a período', async () => {
      const ana = await responsavel('Ana Teste');
      const bia = await responsavel('Bia Teste');
      await negocio({ responsavelId: ana, createdAt: new Date('2026-10-10T15:00:00Z') });
      await negocio({ responsavelId: ana, createdAt: new Date('2026-11-10T15:00:00Z') });
      await negocio({ responsavelId: bia, createdAt: new Date('2026-11-11T15:00:00Z') });
      await negocio({ responsavelId: bia, createdAt: new Date('2026-11-12T15:00:00Z') });
      await criar({ periodo: '2026-10', valor: 2, responsavelId: ana });
      await criar({ periodo: '2026-11', valor: 2, responsavelId: ana });
      await criar({ periodo: '2026-11', valor: 2, responsavelId: bia });
      await criar({ metrica: 'VISITAS', periodo: '2026-11', valor: 5 });

      const res = await http().get(`${BASE}/acompanhamento`).expect(200);
      const dados = acompanhamentoMetasSchema.parse(res.body);

      expect(dados.resumo).toEqual([
        { metrica: 'LEADS', projetado: 6, realizado: 4, percentual: 66.7 },
        { metrica: 'VISITAS', projetado: 5, realizado: 0, percentual: 0 },
      ]);
      expect(dados.evolucao.filter((p) => p.metrica === 'LEADS')).toEqual([
        {
          metrica: 'LEADS',
          periodoTipo: 'MES',
          periodo: '2026-10',
          dataInicio: '2026-10-01',
          projetado: 2,
          realizado: 1,
          percentual: 50,
        },
        {
          metrica: 'LEADS',
          periodoTipo: 'MES',
          periodo: '2026-11',
          dataInicio: '2026-11-01',
          // As metas de Ana e Bia no mesmo mês viram um ponto só.
          projetado: 4,
          realizado: 3,
          percentual: 75,
        },
      ]);
    });

    it('respeita os filtros de período, responsável e métrica', async () => {
      const ana = await responsavel('Ana Teste');
      await criar({ periodo: '2026-10', responsavelId: ana });
      await criar({ periodo: '2026-11' });
      await criar({ metrica: 'VISITAS', periodo: '2026-11' });

      const consulta = async (query: Record<string, string>) =>
        acompanhamentoMetasSchema.parse(
          (await http().get(`${BASE}/acompanhamento`).query(query).expect(200)).body,
        );
      expect((await consulta({ de: '2026-11-01' })).evolucao).toHaveLength(2);
      expect((await consulta({ responsavelId: ana })).evolucao).toHaveLength(1);
      expect((await consulta({ metrica: 'VISITAS' })).resumo).toHaveLength(1);
      expect(await consulta({ de: '2027-01-01' })).toEqual({ resumo: [], evolucao: [] });
      await http().get(`${BASE}/acompanhamento`).query({ metrica: 'X' }).expect(400);
    });
  });

  describe('GET /:id, PATCH /:id e DELETE /:id', () => {
    it('detalha, altera (audita antes e depois) e exclui (audita)', async () => {
      const meta = await criar();

      const detalhe = await http().get(`${BASE}/${meta.id}`).expect(200);
      expect(metaComercialSchema.parse(detalhe.body).valor).toBe(40);

      const alterada = metaComercialSchema.parse(
        (
          await http()
            .patch(`${BASE}/${meta.id}`)
            .send(corpo({ valor: 80, periodo: '2026-12', observacoes: 'Campanha de fim de ano' }))
            .expect(200)
        ).body,
      );
      expect(alterada).toMatchObject({
        periodo: '2026-12',
        dataInicio: '2026-12-01',
        dataFim: '2026-12-31',
        valor: 80,
        observacoes: 'Campanha de fim de ano',
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: meta.id,
        before: { periodo: '2026-11' },
        after: { periodo: '2026-12', valor: 80 },
      });

      await http().delete(`${BASE}/${meta.id}`).expect(200);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: meta.id,
        after: null,
      });
      await http().get(`${BASE}/${meta.id}`).expect(404);
    });

    it('alterar para uma meta que já existe dá 409; a própria meta não conflita consigo', async () => {
      const a = await criar({ periodo: '2026-10' });
      await criar({ periodo: '2026-11' });
      await http()
        .patch(`${BASE}/${a.id}`)
        .send(corpo({ periodo: '2026-11' }))
        .expect(409);
      await http()
        .patch(`${BASE}/${a.id}`)
        .send(corpo({ periodo: '2026-10', valor: 1 }))
        .expect(200);
    });

    it('400 no corpo inválido, 404 inexistente ou excluída, 403 sem permissão', async () => {
      const meta = await criar();
      await http()
        .patch(`${BASE}/${meta.id}`)
        .send(corpo({ valor: -5 }))
        .expect(400);
      await http().get(`${BASE}/não-é-uuid`).expect(400);
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      await http().patch(`${BASE}/${INEXISTENTE}`).send(corpo()).expect(404);
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      await expectNoAudit(prisma, { entity: ENTITY, action: 'DELETE' });

      const soVer = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.metas.ver'],
      });
      await comUsuario(app, soVer).patch(`${BASE}/${meta.id}`).send(corpo()).expect(403);
      await comUsuario(app, soVer).delete(`${BASE}/${meta.id}`).expect(403);
    });
  });

  describe('escopo de dados (issue #153)', () => {
    it('usuário restrito a profissionais vinculados recebe 403 em tudo', async () => {
      const meta = await criar();
      const profissional = await prisma.profissional.create({
        data: { nome: 'Profissional Teste', corCalendario: 'verde' },
      });
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [profissional.id],
      });
      const h = () => comUsuario(app, restrito);

      await h().get(BASE).expect(403);
      await h().get(`${BASE}/acompanhamento`).expect(403);
      await h().get(`${BASE}/${meta.id}`).expect(403);
      await h()
        .post(BASE)
        .send(corpo({ periodo: '2026-12' }))
        .expect(403);
      await h().patch(`${BASE}/${meta.id}`).send(corpo()).expect(403);
      await h().delete(`${BASE}/${meta.id}`).expect(403);
    });
  });
});
