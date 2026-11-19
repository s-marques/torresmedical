import type { INestApplication } from '@nestjs/common';
import {
  evolucaoPageSchema,
  evolucaoSchema,
  evolucaoVozAgendamentoPageSchema,
  evolucaoVozAgendamentoSchema,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/consultorio-assistencial/evolucao-voz';
const PERMISSOES = [
  'consultorio-assistencial.evolucao-voz.ver',
  'consultorio-assistencial.evolucao-voz.criar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const DIA = '2026-11-19';

describe('Evolução por Voz (e2e)', () => {
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

  const http = () => comUsuario(app, usuario);

  async function cenario() {
    const ana = await prisma.paciente.create({ data: { nome: 'Ana Fictícia' } });
    const bruno = await prisma.paciente.create({ data: { nome: 'Bruno Teste' } });
    const profissional = await prisma.profissional.create({ data: { nome: 'Dra. Fictícia' } });
    const outroProfissional = await prisma.profissional.create({ data: { nome: 'Dr. Outro' } });
    const tipo = await prisma.tipoAgendamento.create({
      data: { nome: 'Consulta', duracaoMinutos: 30 },
    });
    const criar = (inicio: string, extra: Record<string, unknown> = {}) =>
      prisma.agendamento.create({
        data: {
          pacienteId: ana.id,
          profissionalId: profissional.id,
          tipoAgendamentoId: tipo.id,
          inicio: new Date(inicio),
          ...extra,
        },
      });
    // 08:00, 09:00 e 10:00 no fuso da clínica (UTC-3).
    const confirmado = await criar(`${DIA}T11:00:00.000Z`, { status: 'CONFIRMADO' });
    const cancelado = await criar(`${DIA}T12:00:00.000Z`, { status: 'CANCELADO' });
    const doBruno = await criar(`${DIA}T13:00:00.000Z`, {
      pacienteId: bruno.id,
      profissionalId: outroProfissional.id,
      status: 'REAGENDAR',
    });
    // Outro dia: 23:30 do dia anterior no fuso da clínica.
    await criar(`${DIA}T02:30:00.000Z`);
    return { ana, bruno, profissional, outroProfissional, confirmado, cancelado, doBruno };
  }

  describe('GET / (agendamentos de hoje)', () => {
    it('lista o dia por hora, sem os cancelados, com o número do agendamento', async () => {
      const { confirmado, doBruno } = await cenario();

      const res = await http().get(BASE).query({ data: DIA }).expect(200);
      const pagina = evolucaoVozAgendamentoPageSchema.parse(res.body);

      expect(pagina.data.map((a) => a.id)).toEqual([confirmado.id, doBruno.id]);
      expect(pagina.data[0]).toMatchObject({
        numero: confirmado.numero,
        pacienteNome: 'Ana Fictícia',
        profissionalNome: 'Dra. Fictícia',
        procedimento: 'Consulta',
        status: 'CONFIRMADO',
      });
    });

    it('"Buscar paciente": filtra pelo nome do paciente e pelo profissional', async () => {
      const { doBruno, outroProfissional } = await cenario();

      const porNome = await http().get(BASE).query({ data: DIA, search: 'bruno' }).expect(200);
      expect(porNome.body.data.map((a: { id: string }) => a.id)).toEqual([doBruno.id]);

      const porProfissional = await http()
        .get(BASE)
        .query({ data: DIA, profissionalId: outroProfissional.id })
        .expect(200);
      expect(porProfissional.body.data.map((a: { id: string }) => a.id)).toEqual([doBruno.id]);
    });

    it('400 sem data e 403 sem permissão', async () => {
      const semData = await http().get(BASE).expect(400);
      expect(semData.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'data' })]),
      );
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE).query({ data: DIA }).expect(403);
    });
  });

  describe('GET /:agendamentoId (cabeçalho)', () => {
    it('traz paciente, profissional e número; 404 inexistente; 400 id inválido', async () => {
      const { confirmado } = await cenario();

      const res = await http().get(`${BASE}/${confirmado.id}`).expect(200);
      expect(evolucaoVozAgendamentoSchema.parse(res.body)).toMatchObject({
        id: confirmado.id,
        numero: confirmado.numero,
        pacienteNome: 'Ana Fictícia',
      });

      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      await http().get(`${BASE}/nao-e-uuid`).expect(400);
    });
  });

  describe('POST /:agendamentoId/evolucoes ("Salvar Evolução")', () => {
    it('sem atendimento: inicia o atendimento e grava a evolução, auditando tudo', async () => {
      const { confirmado } = await cenario();

      const res = await http()
        .post(`${BASE}/${confirmado.id}/evolucoes`)
        .send({ texto: '  Paciente relata melhora das dores.  ' })
        .expect(201);
      const evolucao = evolucaoSchema.parse(res.body);
      expect(evolucao).toMatchObject({
        tipo: 'EVOLUCAO',
        texto: 'Paciente relata melhora das dores.',
        profissionalNome: 'Dra. Fictícia',
      });

      const atendimento = await prisma.atendimento.findFirstOrThrow({
        where: { agendamentoId: confirmado.id },
      });
      expect(atendimento.status).toBe('EM_ANDAMENTO');
      const agendamento = await prisma.agendamento.findUniqueOrThrow({
        where: { id: confirmado.id },
      });
      expect(agendamento.status).toBe('EM_ATENDIMENTO');

      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'AtendimentoEvolucao',
        entityId: evolucao.id,
        before: null,
        after: { tipo: 'EVOLUCAO', texto: 'Paciente relata melhora das dores.' },
        userId: usuario.id,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Atendimento',
        entityId: atendimento.id,
        before: null,
        after: { agendamentoId: confirmado.id, status: 'EM_ANDAMENTO' },
        userId: usuario.id,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Agendamento',
        entityId: confirmado.id,
        before: { status: 'CONFIRMADO' },
        after: { status: 'EM_ATENDIMENTO' },
        userId: usuario.id,
      });

      const historico = await http().get(`${BASE}/${confirmado.id}/evolucoes`).expect(200);
      expect(evolucaoPageSchema.parse(historico.body).data.map((e) => e.id)).toEqual([evolucao.id]);
    });

    it('com atendimento em andamento: grava no mesmo atendimento', async () => {
      const { confirmado } = await cenario();
      await http().post(`${BASE}/${confirmado.id}/evolucoes`).send({ texto: 'Primeira' });
      await http().post(`${BASE}/${confirmado.id}/evolucoes`).send({ texto: 'Segunda' }).expect(201);

      expect(await prisma.atendimento.count({ where: { agendamentoId: confirmado.id } })).toBe(1);
      expect(await prisma.atendimentoEvolucao.count()).toBe(2);
    });

    it('422 para agendamento cancelado ou atendimento finalizado, sem gravar', async () => {
      const { cancelado, confirmado, ana, profissional } = await cenario();

      const res = await http()
        .post(`${BASE}/${cancelado.id}/evolucoes`)
        .send({ texto: 'Texto' })
        .expect(422);
      expect(res.body.code).toBe('AGENDAMENTO_CANCELADO');

      await prisma.atendimento.create({
        data: {
          pacienteId: ana.id,
          profissionalId: profissional.id,
          agendamentoId: confirmado.id,
          status: 'FINALIZADO',
          iniciadoEm: new Date(),
          finalizadoEm: new Date(),
        },
      });
      const finalizado = await http()
        .post(`${BASE}/${confirmado.id}/evolucoes`)
        .send({ texto: 'Texto' })
        .expect(422);
      expect(finalizado.body.code).toBe('ATENDIMENTO_FINALIZADO');
      await expectNoAudit(prisma, { entity: 'AtendimentoEvolucao' });
      await expectNoAudit(prisma, { entity: 'Atendimento' });
    });

    it('400 sem texto, 404 inexistente e 403 sem permissão de criar', async () => {
      const { confirmado } = await cenario();

      const vazio = await http()
        .post(`${BASE}/${confirmado.id}/evolucoes`)
        .send({ texto: '   ' })
        .expect(400);
      expect(vazio.body.details).toEqual([
        expect.objectContaining({ field: 'texto', message: 'Transcrição é obrigatória.' }),
      ]);
      await http().post(`${BASE}/${INEXISTENTE}/evolucoes`).send({ texto: 'Texto' }).expect(404);

      const soVer = await criarUsuarioTeste(app, {
        permissoes: ['consultorio-assistencial.evolucao-voz.ver'],
      });
      await comUsuario(app, soVer)
        .post(`${BASE}/${confirmado.id}/evolucoes`)
        .send({ texto: 'Texto' })
        .expect(403);
      expect(await prisma.atendimento.count()).toBe(0);
      await expectNoAudit(prisma, { entity: 'AtendimentoEvolucao' });
    });
  });

  describe('escopo por profissional (issue #153)', () => {
    it('usuário restrito vê só os agendamentos dos seus profissionais e recebe 403 nos demais', async () => {
      const { confirmado, doBruno, profissional } = await cenario();
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [profissional.id],
      });
      const comRestrito = () => comUsuario(app, restrito);

      const lista = await comRestrito().get(BASE).query({ data: DIA }).expect(200);
      expect(lista.body.data.map((a: { id: string }) => a.id)).toEqual([confirmado.id]);

      await comRestrito().get(`${BASE}/${confirmado.id}`).expect(200);
      await comRestrito().get(`${BASE}/${doBruno.id}`).expect(403);
      await comRestrito().get(`${BASE}/${doBruno.id}/evolucoes`).expect(403);
      await comRestrito()
        .post(`${BASE}/${doBruno.id}/evolucoes`)
        .send({ texto: 'Texto' })
        .expect(403);
      expect(await prisma.atendimento.count()).toBe(0);
    });
  });
});
