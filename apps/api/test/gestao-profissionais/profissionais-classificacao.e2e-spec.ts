import type { INestApplication } from '@nestjs/common';
import {
  classificacaoHistoricoPageSchema,
  dashboardPainelSchema,
  profissionalPageSchema,
  profissionalSchema,
  recalculoClassificacaoSchema,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const API = '/api/gestao-profissionais/profissionais';
const PERMISSOES = [
  'gestao-profissionais.profissionais.ver',
  'gestao-profissionais.profissionais.editar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

const DIA_MS = 86_400_000;

/** `AAAA-MM-DD` de hoje no fuso da clínica, deslocado em `dias`. */
function dia(dias: number): string {
  const base = new Date(Date.now() + dias * DIA_MS);
  return base.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

const diaDaSemana = (data: string): number => new Date(`${data}T00:00:00Z`).getUTCDay();

describe('Classificação do parceiro (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let salaId: string;
  let profissionalId: string;
  /** Os quatro últimos dias fechados (ontem e os três antes), um período contratado em cada. */
  const diasContratados = [dia(-1), dia(-2), dia(-3), dia(-4)];

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    salaId = (await prisma.sala.create({ data: { nome: 'Sala 7', numero: '07' } })).id;
    profissionalId = (
      await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste', ativo: true } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const semPermissao = async () =>
    comUsuario(app, await criarUsuarioTeste(app, { permissoes: [] }));

  /**
   * Contrato assinado há mais de 90 dias, mas vigente só desde a semana passada, com um período
   * (manhã) em cada um dos quatro últimos dias fechados: 4 períodos contratados na janela.
   */
  async function contratar(id = profissionalId) {
    return prisma.contratoSala.create({
      data: {
        salaId,
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId: id,
        valorUnitario: 1500,
        diaVencimento: 10,
        dataInicio: new Date(`${dia(-6)}T00:00:00Z`),
        assinadoEm: new Date(`${dia(-200)}T00:00:00Z`),
        status: 'ATIVO',
        dias: {
          create: diasContratados.map((d) => ({
            diaSemana: diaDaSemana(d),
            inicio: '08:00',
            fim: '12:00',
          })),
        },
      },
    });
  }

  /** Atendimento realizado às 9h (UTC-3) do dia, na sala do contrato. */
  async function atender(data: string, id = profissionalId) {
    const paciente = await prisma.paciente.create({ data: { nome: 'Paciente Teste' } });
    return prisma.agendamento.create({
      data: {
        pacienteId: paciente.id,
        profissionalId: id,
        salaId,
        inicio: new Date(`${data}T12:00:00Z`),
        duracaoMinutos: 60,
        status: 'ATENDIDO',
      },
    });
  }

  async function recalcular() {
    return http().post(`${API}/classificacao/recalcular`).expect(200);
  }

  async function historico(id = profissionalId) {
    const res = await http().get(`${API}/${id}/classificacoes`).expect(200);
    return classificacaoHistoricoPageSchema.parse(res.body);
  }

  describe('POST /classificacao/recalcular', () => {
    it('exemplo do documento: 4 períodos contratados e 1 usado em 30 dias vira "Em risco"', async () => {
      await contratar();
      await atender(diasContratados[0] as string);

      const res = await recalcular();

      expect(recalculoClassificacaoSchema.parse(res.body)).toEqual({ avaliados: 1, alterados: 1 });
      const detalhe = profissionalSchema.parse(
        (await http().get(`${API}/${profissionalId}`).expect(200)).body,
      );
      expect(detalhe).toMatchObject({
        classificacao: 'EM_RISCO',
        classificacaoMotivo: 'BAIXO_USO',
        classificacaoMotivoTexto: '1 de 4 períodos usados em 30 dias',
        classificacaoParametros: { contratados: 4, utilizados: 1 },
        estrategico: false,
      });
      expect(detalhe.classificacaoEm).not.toBeNull();
    });

    it('a mudança de classificação entra no histórico, com a anterior e a auditoria', async () => {
      await contratar();
      await atender(diasContratados[0] as string);
      await recalcular();
      for (const d of diasContratados.slice(1)) await atender(d);

      await recalcular();

      const { data, meta } = await historico();
      expect(meta.total).toBe(2);
      expect(data[0]).toMatchObject({
        classificacaoAnterior: 'EM_RISCO',
        classificacao: 'EM_EXPANSAO',
        motivo: 'MAIS_PERIODOS',
        origem: 'AUTOMATICO',
      });
      expect(data[1]).toMatchObject({
        classificacaoAnterior: null,
        classificacao: 'EM_RISCO',
        motivoTexto: '1 de 4 períodos usados em 30 dias',
      });
      const primeiro = data[1];
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ProfissionalClassificacao',
        entityId: primeiro?.id as string,
        before: null,
        after: { profissionalId, classificacao: 'EM_RISCO', motivo: 'BAIXO_USO' },
        userId: usuario.id,
      });
    });

    it('sem mudança não grava histórico nem auditoria de novo', async () => {
      await contratar();
      await atender(diasContratados[0] as string);
      await recalcular();

      const segunda = await recalcular();

      expect(segunda.body).toEqual({ avaliados: 1, alterados: 0 });
      expect((await historico()).meta.total).toBe(1);
      expect(await prisma.auditLog.count({ where: { entity: 'ProfissionalClassificacao' } })).toBe(
        1,
      );
    });

    it('sem contrato ativo o profissional é "Inativo"', async () => {
      await recalcular();

      const detalhe = profissionalSchema.parse(
        (await http().get(`${API}/${profissionalId}`).expect(200)).body,
      );
      expect(detalhe).toMatchObject({
        classificacao: 'INATIVO',
        classificacaoMotivoTexto: 'Sem contrato de sala ativo',
      });
    });

    it('profissional excluído não entra no cálculo', async () => {
      await prisma.profissional.update({
        where: { id: profissionalId },
        data: { deletedAt: new Date() },
      });

      const res = await recalcular();

      expect(res.body).toEqual({ avaliados: 0, alterados: 0 });
    });

    it('403 sem permissão, e 403 para usuário restrito (visão da clínica toda)', async () => {
      await (await semPermissao()).post(`${API}/classificacao/recalcular`).expect(403);
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [profissionalId],
      });

      await comUsuario(app, restrito).post(`${API}/classificacao/recalcular`).expect(403);
      expect(await prisma.profissionalClassificacao.count()).toBe(0);
    });
  });

  describe('GET /:id/classificacoes', () => {
    it('sem mudanças ainda, lista vazia', async () => {
      const { data, meta } = await historico();
      expect(data).toEqual([]);
      expect(meta.total).toBe(0);
    });

    it('pagina o histórico', async () => {
      await contratar();
      await atender(diasContratados[0] as string);
      await recalcular();
      await http()
        .put(`${API}/${profissionalId}/estrategico`)
        .send({ estrategico: true })
        .expect(200);

      const res = await http()
        .get(`${API}/${profissionalId}/classificacoes?page=2&pageSize=1`)
        .expect(200);

      const pagina = classificacaoHistoricoPageSchema.parse(res.body);
      expect(pagina.meta).toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
      expect(pagina.data[0]?.classificacao).toBe('EM_RISCO');
    });

    it('400 para paginação inválida, 404 para profissional inexistente', async () => {
      await http().get(`${API}/${profissionalId}/classificacoes?page=0`).expect(400);
      await http().get(`${API}/${INEXISTENTE}/classificacoes`).expect(404);
    });

    it('403 sem permissão', async () => {
      await (await semPermissao()).get(`${API}/${profissionalId}/classificacoes`).expect(403);
    });

    it('usuário restrito só vê o histórico dos profissionais vinculados', async () => {
      const outro = (await prisma.profissional.create({ data: { nome: 'Dr. Outro Teste' } })).id;
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [profissionalId],
      });

      await comUsuario(app, restrito).get(`${API}/${profissionalId}/classificacoes`).expect(200);
      await comUsuario(app, restrito).get(`${API}/${outro}/classificacoes`).expect(403);
    });
  });

  describe('PUT /:id/estrategico', () => {
    it('marca como estratégico, reclassifica na hora e audita a alteração', async () => {
      await contratar();
      await atender(diasContratados[0] as string);
      await recalcular();

      const res = await http()
        .put(`${API}/${profissionalId}/estrategico`)
        .send({ estrategico: true })
        .expect(200);

      expect(profissionalSchema.parse(res.body)).toMatchObject({
        estrategico: true,
        classificacao: 'ESTRATEGICO',
        classificacaoMotivoTexto: 'Marcado como estratégico pela gerência',
      });
      const { data } = await historico();
      expect(data[0]).toMatchObject({
        classificacaoAnterior: 'EM_RISCO',
        classificacao: 'ESTRATEGICO',
        origem: 'MANUAL',
        usuarioId: usuario.id,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Profissional',
        entityId: profissionalId,
        before: { estrategico: false },
        after: { estrategico: true, classificacao: 'ESTRATEGICO' },
        userId: usuario.id,
      });
    });

    it('desmarcar volta à classificação pelo uso', async () => {
      await contratar();
      await atender(diasContratados[0] as string);
      await http()
        .put(`${API}/${profissionalId}/estrategico`)
        .send({ estrategico: true })
        .expect(200);

      const res = await http()
        .put(`${API}/${profissionalId}/estrategico`)
        .send({ estrategico: false })
        .expect(200);

      expect(res.body).toMatchObject({ estrategico: false, classificacao: 'EM_RISCO' });
    });

    it('sem contrato ativo continua "Inativo", mesmo marcado', async () => {
      const res = await http()
        .put(`${API}/${profissionalId}/estrategico`)
        .send({ estrategico: true })
        .expect(200);

      expect(res.body).toMatchObject({ estrategico: true, classificacao: 'INATIVO' });
    });

    it('400 para corpo inválido, 404 para inexistente, 403 sem permissão', async () => {
      await http()
        .put(`${API}/${profissionalId}/estrategico`)
        .send({ estrategico: 'sim' })
        .expect(400);
      await http().put(`${API}/${profissionalId}/estrategico`).send({}).expect(400);
      await http().put(`${API}/${INEXISTENTE}/estrategico`).send({ estrategico: true }).expect(404);
      await (
        await semPermissao()
      )
        .put(`${API}/${profissionalId}/estrategico`)
        .send({ estrategico: true })
        .expect(403);
      await expectNoAudit(prisma, { entity: 'Profissional', entityId: profissionalId });
    });

    it('usuário restrito não altera profissional fora do vínculo', async () => {
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [],
      });

      await comUsuario(app, restrito)
        .put(`${API}/${profissionalId}/estrategico`)
        .send({ estrategico: true })
        .expect(403);
      const atual = await prisma.profissional.findUniqueOrThrow({ where: { id: profissionalId } });
      expect(atual.estrategico).toBe(false);
    });
  });

  describe('Lista de profissionais', () => {
    it('filtra pela classificação e traz a classificação em cada linha', async () => {
      await contratar();
      await atender(diasContratados[0] as string);
      await prisma.profissional.create({ data: { nome: 'Dr. Sem Contrato' } });
      await recalcular();

      const risco = profissionalPageSchema.parse(
        (await http().get(`${API}?classificacao=EM_RISCO`).expect(200)).body,
      );
      expect(risco.data.map((p) => p.id)).toEqual([profissionalId]);
      expect(risco.data[0]?.classificacaoMotivoTexto).toBe('1 de 4 períodos usados em 30 dias');

      const inativos = profissionalPageSchema.parse(
        (await http().get(`${API}?classificacao=INATIVO`).expect(200)).body,
      );
      expect(inativos.meta.total).toBe(1);
      const ativos = profissionalPageSchema.parse(
        (await http().get(`${API}?classificacao=ATIVO`).expect(200)).body,
      );
      expect(ativos.meta.total).toBe(0);
    });

    it('ordena pela classificação e rejeita classificação inválida', async () => {
      await http().get(`${API}?sort=classificacao:asc`).expect(200);
      await http().get(`${API}?classificacao=QUALQUER`).expect(400);
    });
  });

  describe('Painel', () => {
    it('Executivo traz os indicadores e o alerta "1 profissional com baixa utilização"', async () => {
      await contratar();
      await atender(diasContratados[0] as string);
      await recalcular();
      const painel = await criarUsuarioTeste(app, { permissoes: ['painel.painel.ver'] });

      const res = await comUsuario(app, painel).get('/api/painel/dashboard/executivo').expect(200);

      const dashboard = dashboardPainelSchema.parse(res.body);
      const blocos = dashboard.secoes.flatMap((s) => s.blocos);
      expect(blocos.find((b) => b.tipo === 'kpi' && b.id === 'parceiros-em-risco')).toMatchObject({
        valor: 1,
      });
      expect(
        blocos.find((b) => b.tipo === 'kpi' && b.id === 'parceiros-em-expansao'),
      ).toMatchObject({ valor: 0 });
      expect(blocos.find((b) => b.tipo === 'alerta' && b.id === 'baixa-utilizacao')).toMatchObject({
        titulo: '1 profissional com baixa utilização',
        itens: [{ rotulo: 'Dra. Ana Teste', valor: '1 de 4 períodos usados em 30 dias' }],
      });
    });
  });
});
