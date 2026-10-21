import type { INestApplication } from '@nestjs/common';
import { servicoProfissionalPageSchema, servicoProfissionalSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/gestao-profissionais/servicos-profissionais';
const PERMISSOES = [
  'gestao-profissionais.servicos-profissionais.ver',
  'gestao-profissionais.servicos-profissionais.criar',
  'gestao-profissionais.servicos-profissionais.editar',
  'gestao-profissionais.servicos-profissionais.excluir',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Serviços Profissionais (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let profissionalId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    profissionalId = (await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  function criarNoBanco(nome: string, extra: { ativo?: boolean; profissionalId?: string } = {}) {
    return prisma.servicoProfissional.create({
      data: { profissionalId, nome, valor: 100, ...extra },
    });
  }

  describe('GET', () => {
    it('agrupa por profissional, filtra por busca, profissional e status', async () => {
      const outro = await prisma.profissional.create({ data: { nome: 'Dr. Bruno Teste' } });
      await criarNoBanco('Retorno');
      await criarNoBanco('Avaliação', { ativo: false });
      await criarNoBanco('Limpeza', { profissionalId: outro.id });
      const excluido = await prisma.profissional.create({
        data: { nome: 'Excluído', deletedAt: new Date() },
      });
      await criarNoBanco('Fantasma', { profissionalId: excluido.id });

      const todos = servicoProfissionalPageSchema.parse((await http().get(BASE).expect(200)).body);
      expect(todos.data.map((s) => [s.profissionalNome, s.nome])).toEqual([
        ['Dr. Bruno Teste', 'Limpeza'],
        ['Dra. Ana Teste', 'Avaliação'],
        ['Dra. Ana Teste', 'Retorno'],
      ]);
      expect(todos.data[0]).toMatchObject({ valor: 100, emUso: false, ativo: true });

      const busca = await http().get(BASE).query({ search: 'ret' }).expect(200);
      expect(busca.body.data.map((s: { nome: string }) => s.nome)).toEqual(['Retorno']);
      const doProfissional = await http().get(BASE).query({ profissionalId: outro.id }).expect(200);
      expect(doProfissional.body.meta.total).toBe(1);
      const inativos = await http().get(BASE).query({ status: 'inativo' }).expect(200);
      expect(inativos.body.data.map((s: { nome: string }) => s.nome)).toEqual(['Avaliação']);
    });

    it('400 para sort fora da whitelist e 403 sem permissão', async () => {
      const res = await http().get(BASE).query({ sort: 'ativo:asc' }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE).expect(403);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 e 400', async () => {
      const servico = await criarNoBanco('Retorno');

      const ok = await http().get(`${BASE}/${servico.id}`).expect(200);
      expect(servicoProfissionalSchema.parse(ok.body)).toMatchObject({ nome: 'Retorno' });
      const nao = await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      expect(nao.body.message).toBe('Serviço não encontrado');
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST', () => {
    it('201 com padrões do modal e audita CREATE', async () => {
      const res = await http()
        .post(BASE)
        .send({ profissionalId, nome: '  Consulta  ', categoria: 'Consulta' })
        .expect(201);

      expect(servicoProfissionalSchema.parse(res.body)).toMatchObject({
        nome: 'Consulta',
        categoria: 'Consulta',
        valor: 0,
        duracaoMinutos: 30,
        descricao: null,
        ativo: true,
        emUso: false,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ServicoProfissional',
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, nome: 'Consulta', profissionalId },
        userId: usuario.id,
      });
    });

    it('400 com mensagens por campo, sem auditar', async () => {
      const res = await http()
        .post(BASE)
        .send({ nome: '', valor: -1, duracaoMinutos: 0, extra: 1 })
        .expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'profissionalId', message: 'Profissional é obrigatório.' },
          { field: 'nome', message: 'Nome do serviço é obrigatório.' },
          { field: 'valor', message: 'O valor não pode ser negativo' },
          { field: 'duracaoMinutos', message: 'A duração deve ser de pelo menos 1 minuto' },
          { field: 'extra', message: 'Campo não permitido' },
        ]),
      );
      await expectNoAudit(prisma, { entity: 'ServicoProfissional' });
    });

    it('400 para profissional inexistente e 403 sem permissão de criar', async () => {
      const res = await http()
        .post(BASE)
        .send({ profissionalId: INEXISTENTE, nome: 'X' })
        .expect(400);
      expect(res.body.details).toEqual([
        { field: 'profissionalId', message: 'Profissional inválido' },
      ]);
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.servicos-profissionais.ver'],
      });
      await comUsuario(app, leitor).post(BASE).send({ profissionalId, nome: 'X' }).expect(403);
    });
  });

  describe('PATCH /:id', () => {
    it('200 e audita UPDATE com before/after', async () => {
      const servico = await criarNoBanco('Retorno');

      const res = await http()
        .patch(`${BASE}/${servico.id}`)
        .send({ profissionalId, nome: 'Retorno 2', valor: 80.5, duracaoMinutos: 20 })
        .expect(200);

      expect(res.body).toMatchObject({ nome: 'Retorno 2', valor: 80.5, duracaoMinutos: 20 });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'ServicoProfissional',
        entityId: servico.id,
        before: { nome: 'Retorno', duracaoMinutos: 30 },
        after: { nome: 'Retorno 2', duracaoMinutos: 20 },
        userId: usuario.id,
      });
    });

    it('400 sem nome e 404 para inexistente, sem auditar', async () => {
      const servico = await criarNoBanco('Retorno');
      await http().patch(`${BASE}/${servico.id}`).send({ profissionalId }).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ profissionalId, nome: 'X' }).expect(404);
      await expectNoAudit(prisma, { entity: 'ServicoProfissional' });
    });
  });

  describe('PATCH /:id/status', () => {
    it('desativa e reativa, auditando UPDATE', async () => {
      const servico = await criarNoBanco('Retorno');

      const desativado = await http()
        .patch(`${BASE}/${servico.id}/status`)
        .send({ ativo: false })
        .expect(200);
      expect(desativado.body.ativo).toBe(false);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'ServicoProfissional',
        entityId: servico.id,
        before: { ativo: true },
        after: { ativo: false },
        userId: usuario.id,
      });

      const reativado = await http()
        .patch(`${BASE}/${servico.id}/status`)
        .send({ ativo: true })
        .expect(200);
      expect(reativado.body.ativo).toBe(true);
    });

    it('400 sem ativo, 404 para inexistente e 403 sem permissão de editar', async () => {
      const servico = await criarNoBanco('Retorno');
      await http().patch(`${BASE}/${servico.id}/status`).send({}).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}/status`).send({ ativo: false }).expect(404);
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.servicos-profissionais.ver'],
      });
      await comUsuario(app, leitor)
        .patch(`${BASE}/${servico.id}/status`)
        .send({ ativo: false })
        .expect(403);
    });
  });

  describe('DELETE /:id', () => {
    it('exclui o serviço sem vínculo e audita DELETE', async () => {
      const servico = await criarNoBanco('Retorno');

      await http().delete(`${BASE}/${servico.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'ServicoProfissional',
        entityId: servico.id,
        before: { nome: 'Retorno' },
        after: null,
        userId: usuario.id,
      });
      expect(await prisma.servicoProfissional.count()).toBe(0);
    });

    it('404 para inexistente e 403 sem permissão de excluir', async () => {
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      await expectNoAudit(prisma, { entity: 'ServicoProfissional' });
      const servico = await criarNoBanco('Retorno');
      const editor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.servicos-profissionais.editar'],
      });
      await comUsuario(app, editor).delete(`${BASE}/${servico.id}`).expect(403);
    });
  });
});
