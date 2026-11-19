import type { INestApplication } from '@nestjs/common';
import { salaPageSchema, salaSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/gestao-profissionais/salas';
const ENTITY = 'Sala';
const PERMISSOES = [
  'gestao-profissionais.salas.ver',
  'gestao-profissionais.salas.criar',
  'gestao-profissionais.salas.editar',
  'gestao-profissionais.salas.excluir',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Salas (e2e)', () => {
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

  function criarNoBanco(nome: string, extra: Record<string, unknown> = {}) {
    return prisma.sala.create({ data: { nome, ...extra } });
  }

  describe('GET', () => {
    it('lista ordenada por nome, filtra por busca, tipo e status e oculta as excluídas', async () => {
      await criarNoBanco('Sala B', { numero: '02', andar: '3º andar' });
      await criarNoBanco('Sala A', { tipo: 'REUNIAO', valorMensal: 1500.5 });
      await criarNoBanco('Sala C', { ativo: false, equipamentos: 'Maca' });
      await criarNoBanco('Sala D', { deletedAt: new Date() });

      const todas = salaPageSchema.parse((await http().get(BASE).expect(200)).body);
      expect(todas.data.map((s) => s.nome)).toEqual(['Sala A', 'Sala B', 'Sala C']);
      expect(todas.data[0]).toMatchObject({
        tipo: 'REUNIAO',
        capacidade: 1,
        valorMensal: 1500.5,
        metragem: null,
        emUso: false,
      });

      const busca = await http().get(BASE).query({ search: '3º and' }).expect(200);
      expect(busca.body.data.map((s: { nome: string }) => s.nome)).toEqual(['Sala B']);
      const equipamento = await http().get(BASE).query({ search: 'maca' }).expect(200);
      expect(equipamento.body.meta.total).toBe(1);
      const reuniao = await http().get(BASE).query({ tipo: 'REUNIAO' }).expect(200);
      expect(reuniao.body.data.map((s: { nome: string }) => s.nome)).toEqual(['Sala A']);
      const inativas = await http().get(BASE).query({ status: 'inativo' }).expect(200);
      expect(inativas.body.data.map((s: { nome: string }) => s.nome)).toEqual(['Sala C']);
    });

    it('400 para sort fora da whitelist e 403 sem permissão', async () => {
      const res = await http().get(BASE).query({ sort: 'ativo:asc' }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE).expect(403);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 (inclusive excluída) e 400', async () => {
      const sala = await criarNoBanco('Sala 1');
      const excluida = await criarNoBanco('Sala 2', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${sala.id}`).expect(200);
      expect(salaSchema.parse(ok.body)).toMatchObject({ nome: 'Sala 1' });
      const nao = await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      expect(nao.body.message).toBe('Sala não encontrada');
      await http().get(`${BASE}/${excluida.id}`).expect(404);
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST', () => {
    it('201 com os padrões do modal e audita CREATE', async () => {
      const res = await http().post(BASE).send({ nome: '  Sala 1  ', valorHora: 80 }).expect(201);

      expect(salaSchema.parse(res.body)).toMatchObject({
        nome: 'Sala 1',
        numero: null,
        tipo: 'CONSULTORIO',
        capacidade: 1,
        valorHora: 80,
        ativo: true,
        emUso: false,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, nome: 'Sala 1' },
        userId: usuario.id,
      });
    });

    it('400 com mensagens por campo, sem auditar', async () => {
      const res = await http()
        .post(BASE)
        .send({ nome: '', tipo: 'INEXISTENTE', valorMensal: -1, extra: 1 })
        .expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'nome', message: 'Nome é obrigatório.' }),
          expect.objectContaining({ field: 'tipo', message: 'Tipo inválido' }),
          expect.objectContaining({
            field: 'valorMensal',
            message: 'Valor mensal não pode ser negativo',
          }),
          expect.objectContaining({ field: 'extra', message: 'Campo não permitido' }),
        ]),
      );
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('403 sem permissão de criar', async () => {
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.ver'],
      });
      await comUsuario(app, leitor).post(BASE).send({ nome: 'X' }).expect(403);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id', () => {
    it('200, substitui os campos e audita UPDATE com before/after', async () => {
      const sala = await criarNoBanco('Sala 1', { numero: '01', valorHora: 50 });

      const res = await http()
        .patch(`${BASE}/${sala.id}`)
        .send({ nome: 'Sala 1A', tipo: 'REUNIAO', valorMensal: 2000 })
        .expect(200);

      expect(res.body).toMatchObject({
        nome: 'Sala 1A',
        tipo: 'REUNIAO',
        numero: null,
        valorHora: null,
        valorMensal: 2000,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: sala.id,
        before: { nome: 'Sala 1', numero: '01', tipo: 'CONSULTORIO' },
        after: { nome: 'Sala 1A', numero: null, tipo: 'REUNIAO' },
        userId: usuario.id,
      });
    });

    it('400 sem nome, 404 para inexistente e 403 sem permissão, sem auditar', async () => {
      const sala = await criarNoBanco('Sala 1');
      await http().patch(`${BASE}/${sala.id}`).send({}).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ nome: 'X' }).expect(404);
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.ver'],
      });
      await comUsuario(app, leitor).patch(`${BASE}/${sala.id}`).send({ nome: 'X' }).expect(403);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem e do detalhe', async () => {
      const sala = await criarNoBanco('Sala 1');

      await http().delete(`${BASE}/${sala.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: sala.id,
        before: { nome: 'Sala 1', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.sala.findUniqueOrThrow({ where: { id: sala.id } })).deletedAt,
      ).not.toBeNull();
      expect((await http().get(BASE).expect(200)).body.data).toEqual([]);
      await http().get(`${BASE}/${sala.id}`).expect(404);
      await http().delete(`${BASE}/${sala.id}`).expect(404);
    });

    it('409 SALA_EM_USO quando a sala tem contrato, sem auditar', async () => {
      const sala = await criarNoBanco('Sala 1');
      const profissional = await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste' } });
      await prisma.contratoSala.create({
        data: {
          salaId: sala.id,
          modalidade: 'MENSAL',
          locatarioTipo: 'PROFISSIONAL',
          profissionalId: profissional.id,
          valorUnitario: 1000,
          dataInicio: new Date('2026-10-01T00:00:00Z'),
        },
      });

      const listada = await http().get(BASE).expect(200);
      expect(listada.body.data[0].emUso).toBe(true);
      const res = await http().delete(`${BASE}/${sala.id}`).expect(409);
      expect(res.body.code).toBe('SALA_EM_USO');

      await expectNoAudit(prisma, { entity: ENTITY, action: 'DELETE' });
      expect(
        (await prisma.sala.findUniqueOrThrow({ where: { id: sala.id } })).deletedAt,
      ).toBeNull();
    });

    it('404 para inexistente e 403 sem permissão de excluir', async () => {
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      const sala = await criarNoBanco('Sala 1');
      const editor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.editar'],
      });
      await comUsuario(app, editor).delete(`${BASE}/${sala.id}`).expect(403);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });
});
