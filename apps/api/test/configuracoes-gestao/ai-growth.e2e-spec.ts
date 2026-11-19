import type { INestApplication } from '@nestjs/common';
import { aiGrowthAnaliseSchema, aiGrowthPainelSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AiGrowthService } from '../../src/modules/configuracoes-gestao/ai-growth/ai-growth.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/configuracoes-gestao/ai-growth';
const PERMISSOES = [
  'configuracoes-gestao.ai-growth.ver',
  'configuracoes-gestao.ai-growth.criar',
] as const;
const ENTITY = 'AnaliseAiGrowth';
const DIA_MS = 24 * 60 * 60 * 1000;

describe('AI Growth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servico: AiGrowthService;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    servico = app.get(AiGrowthService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  describe('GET', () => {
    it('200 vazio antes da primeira análise', async () => {
      const res = await http().get(BASE).expect(200);
      expect(aiGrowthPainelSchema.parse(res.body)).toEqual({
        ultimaAnalise: null,
        emAndamento: null,
        insights: [],
        pontosAtencao: 0,
      });
    });

    it('403 sem permissão e para perfil de escopo restrito', async () => {
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE).expect(403);

      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
      });
      await comUsuario(app, restrito).get(BASE).expect(403);
      await comUsuario(app, restrito).post(`${BASE}/analisar`).expect(403);
    });
  });

  describe('POST /analisar', () => {
    it('202 cria a análise pendente, publica o comando e audita CREATE', async () => {
      const res = await http().post(`${BASE}/analisar`).expect(202);
      const analise = aiGrowthAnaliseSchema.parse(res.body);
      expect(analise.status).toBe('PENDENTE');

      const eventos = await prisma.outboxEvent.findMany({
        where: { type: 'configuracoes-gestao.ai-growth.analisar' },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0]?.envelope).toMatchObject({ payload: { analiseId: analise.id } });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: analise.id,
        before: null,
        after: { id: analise.id, status: 'PENDENTE' },
        userId: usuario.id,
      });

      const painel = await http().get(BASE).expect(200);
      expect(painel.body.emAndamento).toMatchObject({ id: analise.id, status: 'PENDENTE' });
    });

    it('409 enquanto há análise em andamento, sem auditar nem publicar de novo', async () => {
      await http().post(`${BASE}/analisar`).expect(202);
      const res = await http().post(`${BASE}/analisar`).expect(409);
      expect(res.body.code).toBe('ANALISE_AI_GROWTH_EM_ANDAMENTO');
      expect(await prisma.outboxEvent.count()).toBe(1);
      expect(await prisma.analiseAiGrowth.count()).toBe(1);
    });

    it('análise parada há mais de 15 minutos não bloqueia uma nova', async () => {
      await prisma.analiseAiGrowth.create({
        data: { status: 'PROCESSANDO', solicitadaEm: new Date(Date.now() - 20 * 60 * 1000) },
      });
      await http().post(`${BASE}/analisar`).expect(202);
    });

    it('403 sem a permissão de criar, sem auditar', async () => {
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['configuracoes-gestao.ai-growth.ver'],
      });
      await comUsuario(app, leitor).post(`${BASE}/analisar`).expect(403);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('processamento da análise', () => {
    it('calcula os 7 insights sobre agenda e pacientes e é idempotente', async () => {
      const agora = Date.now();
      const [ativo, ocioso] = await Promise.all([
        prisma.profissional.create({ data: { nome: 'Prof A' } }),
        prisma.profissional.create({ data: { nome: 'Prof B' } }),
      ]);
      const paciente = await prisma.paciente.create({
        data: { nome: 'Paciente Teste', dataNascimento: new Date(agora + 2 * DIA_MS) },
      });
      const agendar = (
        profissionalId: string,
        dias: number,
        status: 'ATENDIDO' | 'FALTOU' | 'REAGENDAR',
      ) =>
        prisma.agendamento.create({
          data: {
            pacienteId: paciente.id,
            profissionalId,
            inicio: new Date(agora + dias * DIA_MS),
            status,
            valor: 100,
          },
        });
      await agendar(ativo.id, -100, 'ATENDIDO');
      for (let i = 1; i <= 6; i++) await agendar(ativo.id, -i, 'ATENDIDO');
      await agendar(ocioso.id, -10, 'FALTOU');
      await agendar(ocioso.id, -5, 'REAGENDAR');

      const { id } = (await http().post(`${BASE}/analisar`).expect(202)).body;
      expect(await servico.processar(id)).toBe(true);
      expect(await servico.processar(id)).toBe(false);

      const painel = aiGrowthPainelSchema.parse((await http().get(BASE).expect(200)).body);
      expect(painel.ultimaAnalise).toMatchObject({ id, status: 'CONCLUIDA' });
      expect(painel.emAndamento).toBeNull();
      expect(painel.pontosAtencao).toBe(7);
      const por = Object.fromEntries(painel.insights.map((i) => [i.tipo, i]));
      expect(por.PACIENTES_PENDENTES_RETORNO).toMatchObject({ quantidade: 1, prioridade: 'MEDIA' });
      expect(por.FALTAS_RECENTES).toMatchObject({ quantidade: 1, prioridade: 'MEDIA' });
      expect(por.ANIVERSARIANTES_PROXIMOS).toMatchObject({ quantidade: 1 });
      expect(por.PROFISSIONAIS_SUBUTILIZADOS).toMatchObject({
        quantidade: 1,
        parametros: { media: 3, faturado: 0 },
      });
      // Atendido há 1 dia: o paciente não está inativo.
      expect(por.PACIENTES_INATIVOS).toMatchObject({ quantidade: 0, prioridade: 'BAIXA' });
      expect(await prisma.insightAiGrowth.count()).toBe(7);
    });

    it('registra a falha sem perder o histórico', async () => {
      const { id } = (await http().post(`${BASE}/analisar`).expect(202)).body;
      const fontes = servico['fontes'];
      jest.spyOn(fontes, 'coletar').mockRejectedValueOnce(new Error('boom'));
      await servico.processar(id);
      const analise = await prisma.analiseAiGrowth.findUniqueOrThrow({ where: { id } });
      expect(analise).toMatchObject({ status: 'FALHOU', erro: 'ERRO_PROCESSAMENTO' });
    });
  });
});
