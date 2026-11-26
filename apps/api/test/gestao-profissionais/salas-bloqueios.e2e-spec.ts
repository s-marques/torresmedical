import type { INestApplication } from '@nestjs/common';
import { salaBloqueioPageSchema, salaBloqueioSchema, salaOcupacaoSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';
import { criarMotivo, criarMotivoOutro } from '../utils/motivos-cancelamento';

/** Bloqueios e reservas de sala (issue #138). */
const BASE = '/api/gestao-profissionais/salas-bloqueios';
const ENTITY = 'SalaBloqueio';
const PERMISSOES = [
  'gestao-profissionais.salas.ver',
  'gestao-profissionais.salas.criar',
  'gestao-profissionais.salas.editar',
  'gestao-profissionais.salas.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Bloqueios de salas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let salaId: string;
  let profissionalId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    salaId = (await prisma.sala.create({ data: { nome: 'Sala 7' } })).id;
    profissionalId = (await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  const manutencao = (extra: Record<string, unknown> = {}) => ({
    salaId,
    tipo: 'MANUTENCAO',
    dataInicio: '2026-12-10',
    dataFim: '2026-12-10',
    horaInicio: '08:00',
    horaFim: '12:00',
    motivo: 'Troca do ar-condicionado',
    ...extra,
  });

  function criarNoBanco(extra: Record<string, unknown> = {}) {
    return prisma.salaBloqueio.create({
      data: {
        salaId,
        tipo: 'MANUTENCAO',
        dataInicio: new Date('2026-12-10T00:00:00Z'),
        dataFim: new Date('2026-12-10T00:00:00Z'),
        horaInicio: '08:00',
        horaFim: '12:00',
        ...extra,
      },
    });
  }

  describe('POST', () => {
    it('cria com o usuário como responsável e grava o audit_log', async () => {
      const res = await http().post(BASE).send(manutencao({ profissionalId })).expect(201);
      const criado = salaBloqueioSchema.parse(res.body);
      expect(criado).toMatchObject({
        salaNome: 'Sala 7',
        tipo: 'MANUTENCAO',
        status: 'ATIVO',
        recorrente: false,
        profissionalNome: 'Dra. Ana Teste',
        criadoPorId: usuario.id,
        oculto: false,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: criado.id,
        before: null,
        after: { id: criado.id, salaId, tipo: 'MANUTENCAO', criadoPorId: usuario.id },
        userId: usuario.id,
      });
    });

    it('recorrente grava os dias da semana', async () => {
      const res = await http()
        .post(BASE)
        .send({
          salaId,
          tipo: 'RESERVA',
          recorrente: true,
          dataInicio: '2026-12-01',
          dataFim: '2026-12-31',
          dias: [
            { diaSemana: 3, inicio: '14:00', fim: '18:00' },
            { diaSemana: 1, inicio: '08:00', fim: '12:00' },
          ],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        recorrente: true,
        horaInicio: null,
        dias: [
          { diaSemana: 1, inicio: '08:00', fim: '12:00' },
          { diaSemana: 3, inicio: '14:00', fim: '18:00' },
        ],
      });
    });

    it('400 com os campos; 400 para sala inexistente; nada auditado', async () => {
      const res = await http().post(BASE).send({}).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'salaId', message: 'Sala é obrigatória.' }),
        ]),
      );
      const sala = await http()
        .post(BASE)
        .send(manutencao({ salaId: INEXISTENTE }))
        .expect(400);
      expect(sala.body.details).toEqual([{ field: 'salaId', message: 'Sala inválida' }]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('409 quando sobrepõe outro bloqueio ativo da mesma sala', async () => {
      await criarNoBanco();
      const res = await http()
        .post(BASE)
        .send(manutencao({ horaInicio: '11:00', horaFim: '13:00', tipo: 'RESERVA' }))
        .expect(409);
      expect(res.body).toMatchObject({
        code: 'SALA_BLOQUEIO_CONFLITO',
        message: 'A sala Sala 7 já tem manutenção em 10/12/2026 (08:00-12:00).',
      });
      // Cancelado não conta; outra sala também não.
      await prisma.salaBloqueio.updateMany({ data: { canceladoEm: new Date() } });
      await http()
        .post(BASE)
        .send(manutencao({ horaInicio: '11:00', horaFim: '13:00' }))
        .expect(201);
    });

    it('concorrência: duas gravações simultâneas no mesmo horário não passam as duas', async () => {
      const respostas = await Promise.all([
        http().post(BASE).send(manutencao()),
        http()
          .post(BASE)
          .send(manutencao({ tipo: 'RESERVA' })),
      ]);
      expect(respostas.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.salaBloqueio.count()).toBe(1);
    });

    it('403 sem permissão e para usuário restrito', async () => {
      const semPermissao = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.ver'],
      });
      await comUsuario(app, semPermissao).post(BASE).send(manutencao()).expect(403);
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [profissionalId],
      });
      await comUsuario(app, restrito).post(BASE).send(manutencao()).expect(403);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('GET', () => {
    it('lista com filtros de status, tipo, sala e período', async () => {
      const outraSala = await prisma.sala.create({ data: { nome: 'Sala 8' } });
      await criarNoBanco();
      await criarNoBanco({ tipo: 'CORTESIA', salaId: outraSala.id });
      await criarNoBanco({
        tipo: 'RESERVA',
        dataInicio: new Date('2027-01-05T00:00:00Z'),
        dataFim: new Date('2027-01-05T00:00:00Z'),
        canceladoEm: new Date(),
      });

      const todos = salaBloqueioPageSchema.parse((await http().get(BASE).expect(200)).body);
      expect(todos.meta.total).toBe(3);
      const nomes = async (query: Record<string, string>) =>
        (await http().get(BASE).query(query).expect(200)).body.data.map(
          (b: { tipo: string }) => b.tipo,
        );
      expect(await nomes({ status: 'CANCELADO' })).toEqual(['RESERVA']);
      expect(await nomes({ status: 'ATIVO', salaId })).toEqual(['MANUTENCAO']);
      expect(await nomes({ tipo: 'CORTESIA' })).toEqual(['CORTESIA']);
      expect(await nomes({ de: '2027-01-01', ate: '2027-01-31' })).toEqual(['RESERVA']);
      await http().get(BASE).query({ sort: 'motivo:asc' }).expect(400);
      await http().get(BASE).query({ de: '2027-01-02', ate: '2027-01-01' }).expect(400);
    });

    it('detalhe: 200, 404 e 403 sem permissão', async () => {
      const b = await criarNoBanco();
      const detalhe = salaBloqueioSchema.parse(
        (await http().get(`${BASE}/${b.id}`).expect(200)).body,
      );
      expect(detalhe).toMatchObject({ id: b.id, salaNome: 'Sala 7', tipo: 'MANUTENCAO' });
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(`${BASE}/${b.id}`).expect(403);
    });

    it('restrito: só salas do seu contrato, com o bloqueio de outro profissional oculto', async () => {
      const outro = await prisma.profissional.create({ data: { nome: 'Dr. Outro' } });
      const salaSemContrato = await prisma.sala.create({ data: { nome: 'Sala 9' } });
      await prisma.contratoSala.create({
        data: {
          salaId,
          modalidade: 'MENSAL',
          locatarioTipo: 'PROFISSIONAL',
          profissionalId,
          valorUnitario: 1000,
          dataInicio: new Date('2026-01-01T00:00:00Z'),
        },
      });
      const deOutro = await criarNoBanco({
        tipo: 'RESERVA',
        profissionalId: outro.id,
        motivo: 'X',
      });
      const fora = await criarNoBanco({ salaId: salaSemContrato.id });
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [profissionalId],
      });
      const res = await comUsuario(app, restrito).get(BASE).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        id: deOutro.id,
        oculto: true,
        profissionalNome: null,
        motivo: null,
      });
      await comUsuario(app, restrito).get(`${BASE}/${fora.id}`).expect(403);
    });
  });

  describe('PATCH', () => {
    it('altera e grava before/after; 409 no conflito; 404', async () => {
      const b = await criarNoBanco();
      const res = await http()
        .patch(`${BASE}/${b.id}`)
        .send(manutencao({ horaFim: '10:00', motivo: 'Pintura' }))
        .expect(200);
      expect(res.body).toMatchObject({ horaFim: '10:00', motivo: 'Pintura' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: b.id,
        before: { horaFim: '12:00', motivo: null },
        after: { horaFim: '10:00', motivo: 'Pintura' },
        userId: usuario.id,
      });

      await criarNoBanco({ horaInicio: '14:00', horaFim: '16:00' });
      await http()
        .patch(`${BASE}/${b.id}`)
        .send(manutencao({ horaFim: '15:00' }))
        .expect(409);
      await http().patch(`${BASE}/${INEXISTENTE}`).send(manutencao()).expect(404);
    });
  });

  describe('POST :id/cancelar (motivo da lista, issue #162)', () => {
    let motivoId: string;
    let outroId: string;

    beforeEach(async () => {
      motivoId = (await criarMotivo(prisma, 'PERIODO', { nome: 'Manutenção da sala' })).id;
      outroId = (await criarMotivoOutro(prisma, 'PERIODO')).id;
    });

    it('cancela sem excluir, com quem, quando e o motivo, e audita', async () => {
      const b = await criarNoBanco();
      const res = await http()
        .post(`${BASE}/${b.id}/cancelar`)
        .send({ motivoId, observacao: 'Obra adiada' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'CANCELADO',
        canceladoPorId: usuario.id,
        motivoCancelamento: 'Obra adiada',
      });
      expect(res.body.canceladoEm).toEqual(expect.any(String));
      expect(await prisma.salaBloqueio.count()).toBe(1);
      const [registro] = await prisma.cancelamento.findMany({ where: { entidadeId: b.id } });
      expect(registro).toMatchObject({
        tipo: 'PERIODO',
        entidade: 'SalaBloqueio',
        motivoId,
        motivoNome: 'Manutenção da sala',
        observacao: 'Obra adiada',
        canceladoPorId: usuario.id,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: b.id,
        before: { canceladoEm: null },
        after: { canceladoPorId: usuario.id, motivoCancelamento: 'Obra adiada' },
        userId: usuario.id,
      });
    });

    it('sem observação, o motivo da lista fica como texto do cancelamento', async () => {
      const b = await criarNoBanco();
      const res = await http().post(`${BASE}/${b.id}/cancelar`).send({ motivoId }).expect(200);
      expect(res.body.motivoCancelamento).toBe('Manutenção da sala');
    });

    it('400 sem motivo, com motivo de outra lista ou "Outro" sem observação; 409 se já cancelado; 404', async () => {
      const b = await criarNoBanco();
      const vazio = await http().post(`${BASE}/${b.id}/cancelar`).send({}).expect(400);
      expect(vazio.body.details).toEqual([
        expect.objectContaining({ field: 'motivoId', message: 'Motivo é obrigatório.' }),
      ]);
      const outraLista = (await criarMotivo(prisma, 'CONSULTA', { nome: 'Erro' })).id;
      await http().post(`${BASE}/${b.id}/cancelar`).send({ motivoId: outraLista }).expect(400);
      const semTexto = await http()
        .post(`${BASE}/${b.id}/cancelar`)
        .send({ motivoId: outroId })
        .expect(400);
      expect(semTexto.body.details).toEqual([
        { field: 'observacao', message: 'Observação é obrigatória.' },
      ]);
      expect(await prisma.cancelamento.count()).toBe(0);

      await http().post(`${BASE}/${b.id}/cancelar`).send({ motivoId }).expect(200);
      await http().post(`${BASE}/${b.id}/cancelar`).send({ motivoId }).expect(409);
      expect(await prisma.cancelamento.count()).toBe(1);
      await http().post(`${BASE}/${INEXISTENTE}/cancelar`).send({ motivoId }).expect(404);
    });
  });

  describe('Exportar', () => {
    it('gera o Excel e audita a exportação', async () => {
      await criarNoBanco();
      await http().get(`${BASE}/export`).query({ format: 'xlsx' }).expect(200);
      await expectAudit(prisma, { action: 'EXPORT', entity: ENTITY, entityId: '*' });
    });
  });

  describe('Mapa de Ocupação e Dashboard', () => {
    it('o mapa traz os dias de bloqueio; reserva ocupa a sala no dashboard e cortesia não', async () => {
      // Semana de 07/12/2026 (segunda) a 13/12/2026.
      await criarNoBanco({ dataFim: new Date('2026-12-11T00:00:00Z'), horaFim: '10:00' });
      const mapa = salaOcupacaoSchema.parse(
        (
          await http()
            .get('/api/gestao-profissionais/salas/ocupacao')
            .query({ inicio: '2026-12-07' })
            .expect(200)
        ).body,
      );
      expect(mapa.salas[0]?.bloqueios.map((b) => [b.data, b.inicio, b.fim])).toEqual([
        ['2026-12-10', '08:00', '24:00'],
        ['2026-12-11', '00:00', '10:00'],
      ]);

      const dashboard = async () =>
        (
          await http()
            .get('/api/gestao-profissionais/salas/dashboard')
            .query({ data: '2026-12-10' })
            .expect(200)
        ).body;
      expect(await dashboard()).toMatchObject({ totalSalas: 1, ocupadas: 0 });
      await prisma.salaBloqueio.updateMany({ data: { tipo: 'CORTESIA' } });
      expect(await dashboard()).toMatchObject({ ocupadas: 0 });
      await prisma.salaBloqueio.updateMany({ data: { tipo: 'RESERVA' } });
      expect(await dashboard()).toMatchObject({ ocupadas: 1, taxaOcupacao: 100 });
    });
  });
});
