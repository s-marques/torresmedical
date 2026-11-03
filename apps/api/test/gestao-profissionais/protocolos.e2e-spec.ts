import type { INestApplication } from '@nestjs/common';
import { protocoloMaePageSchema, protocoloPageSchema, protocoloSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/gestao-profissionais/protocolos';
const BASE_MAE = '/api/gestao-profissionais/protocolos-mae';
const ACOES = ['ver', 'criar', 'editar', 'excluir'] as const;
const PERMISSOES = ACOES.map((a) => `gestao-profissionais.protocolos.${a}` as const);
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Protocolos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let profissionalId: string;
  let produtoId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    profissionalId = (await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste' } })).id;
    produtoId = (
      await prisma.produto.create({ data: { nome: 'Máscara Teste', tipo: 'PRODUTO' } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  function criarNoBanco(nome: string, extra: { categoria?: string; deletedAt?: Date } = {}) {
    return prisma.protocolo.create({ data: { nome, profissionalId, ...extra } });
  }

  describe('GET', () => {
    it('agrupa por categoria, filtra por busca, categoria e profissional e ignora excluídos', async () => {
      const outro = await prisma.profissional.create({ data: { nome: 'Dr. Bruno Teste' } });
      await criarNoBanco('Limpeza', { categoria: 'Estética' });
      await criarNoBanco('Avaliação');
      await criarNoBanco('Fantasma', { deletedAt: new Date() });
      await prisma.protocolo.create({ data: { nome: 'Outro', profissionalId: outro.id } });

      const todos = protocoloPageSchema.parse((await http().get(BASE).expect(200)).body);
      expect(todos.data.map((p) => [p.categoria, p.nome])).toEqual([
        ['Estética', 'Limpeza'],
        ['Geral', 'Avaliação'],
        ['Geral', 'Outro'],
      ]);

      const busca = await http().get(BASE).query({ search: 'limp' }).expect(200);
      expect(busca.body.data.map((p: { nome: string }) => p.nome)).toEqual(['Limpeza']);
      const categoria = await http().get(BASE).query({ categoria: 'Geral' }).expect(200);
      expect(categoria.body.meta.total).toBe(2);
      const doProfissional = await http().get(BASE).query({ profissionalId: outro.id }).expect(200);
      expect(doProfissional.body.data.map((p: { nome: string }) => p.nome)).toEqual(['Outro']);
    });

    it('lista as categorias em uso', async () => {
      await criarNoBanco('A', { categoria: 'Estética' });
      await criarNoBanco('B');
      await criarNoBanco('C', { categoria: 'Antiga', deletedAt: new Date() });
      const res = await http().get(`${BASE}/categorias`).expect(200);
      expect(res.body).toEqual({ data: ['Estética', 'Geral'] });
    });

    it('400 para sort fora da whitelist e 403 sem permissão', async () => {
      const res = await http().get(BASE).query({ sort: 'tipo:asc' }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE).expect(403);
    });
  });

  describe('GET /:id', () => {
    it('200 com itens e sessões, 404 e 400', async () => {
      const protocolo = await criarNoBanco('Dia D');
      await prisma.protocoloItem.create({
        data: { protocoloId: protocolo.id, produtoId, quantidade: 2 },
      });

      const ok = await http().get(`${BASE}/${protocolo.id}`).expect(200);
      expect(protocoloSchema.parse(ok.body)).toMatchObject({
        nome: 'Dia D',
        sessoes: 2,
        itens: [{ produtoId, produtoNome: 'Máscara Teste', quantidade: 2 }],
      });
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST', () => {
    it('201 com os padrões do modal, itens e audita CREATE', async () => {
      const res = await http()
        .post(BASE)
        .send({ nome: '  Limpeza de pele ', profissionalId, itens: [{ produtoId, quantidade: 3 }] })
        .expect(201);

      expect(protocoloSchema.parse(res.body)).toMatchObject({
        nome: 'Limpeza de pele',
        tipo: 'procedimento',
        categoria: 'Geral',
        totalSemanas: 1,
        valorTotal: 0,
        profissionalNome: 'Dra. Ana Teste',
        itens: [{ produtoId, quantidade: 3 }],
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Protocolo',
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, nome: 'Limpeza de pele' },
        userId: usuario.id,
      });
    });

    it('400: nome é obrigatório e campos extras são recusados, sem auditar', async () => {
      const res = await http().post(BASE).send({ nome: '  ', extra: 1 }).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'nome', message: 'Nome é obrigatório.' },
          { field: 'extra', message: 'Campo não permitido' },
        ]),
      );
      await http().post(BASE).send({}).expect(400);
      await expectNoAudit(prisma, { entity: 'Protocolo' });
    });

    it('409 para nome repetido, sem diferenciar maiúsculas, e libera o de excluído', async () => {
      await criarNoBanco('Limpeza de pele');
      const res = await http().post(BASE).send({ nome: ' LIMPEZA DE PELE ' }).expect(409);
      expect(res.body).toMatchObject({
        code: 'PROTOCOLO_DUPLICADO',
        message: 'Já existe um protocolo com este nome.',
        details: [{ field: 'nome', message: 'Já existe um protocolo com este nome.' }],
      });
      await expectNoAudit(prisma, { entity: 'Protocolo' });

      await criarNoBanco('Antigo', { deletedAt: new Date() });
      await http().post(BASE).send({ nome: 'Antigo' }).expect(201);
    });

    it('400 para profissional ou produto inexistente e 403 sem permissão de criar', async () => {
      const prof = await http().post(BASE).send({ nome: 'X', profissionalId: INEXISTENTE }).expect(400);
      expect(prof.body.details).toEqual([
        { field: 'profissionalId', message: 'Profissional inválido' },
      ]);
      const prod = await http()
        .post(BASE)
        .send({ nome: 'X', itens: [{ produtoId: INEXISTENTE, quantidade: 1 }] })
        .expect(400);
      expect(prod.body.details).toEqual([
        { field: 'itens.0.produtoId', message: 'Produto/Serviço inválido' },
      ]);
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.protocolos.ver'],
      });
      await comUsuario(app, leitor).post(BASE).send({ nome: 'X' }).expect(403);
    });
  });

  describe('POST /:id/duplicar', () => {
    it('cria "Cópia de", copia os itens e evita nome repetido', async () => {
      const original = await criarNoBanco('Dia D');
      await prisma.protocoloItem.create({
        data: { protocoloId: original.id, produtoId, quantidade: 2 },
      });

      const primeira = await http().post(`${BASE}/${original.id}/duplicar`).expect(201);
      expect(primeira.body).toMatchObject({
        nome: 'Cópia de Dia D',
        itens: [{ produtoId, quantidade: 2 }],
      });
      const segunda = await http().post(`${BASE}/${original.id}/duplicar`).expect(201);
      expect(segunda.body.nome).toBe('Cópia de Dia D (2)');
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Protocolo',
        entityId: primeira.body.id,
        before: null,
        userId: usuario.id,
      });
      await http().post(`${BASE}/${INEXISTENTE}/duplicar`).expect(404);
    });
  });

  describe('PATCH /:id', () => {
    it('200, substitui os itens e audita UPDATE com before/after', async () => {
      const protocolo = await criarNoBanco('Limpeza');
      await prisma.protocoloItem.create({
        data: { protocoloId: protocolo.id, produtoId, quantidade: 1 },
      });

      const res = await http()
        .patch(`${BASE}/${protocolo.id}`)
        .send({ nome: 'Limpeza 2', valorTotal: 250, totalSemanas: 2, itens: [] })
        .expect(200);

      expect(res.body).toMatchObject({ nome: 'Limpeza 2', valorTotal: 250, itens: [] });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Protocolo',
        entityId: protocolo.id,
        before: { nome: 'Limpeza' },
        after: { nome: 'Limpeza 2', totalSemanas: 2 },
        userId: usuario.id,
      });
    });

    it('mantém o próprio nome, mas 409 com o nome de outro protocolo', async () => {
      const a = await criarNoBanco('A');
      await criarNoBanco('B');
      await http().patch(`${BASE}/${a.id}`).send({ nome: 'a', observacoes: 'novo' }).expect(200);
      const res = await http().patch(`${BASE}/${a.id}`).send({ nome: 'b' }).expect(409);
      expect(res.body.code).toBe('PROTOCOLO_DUPLICADO');
    });

    it('400 sem nome e 404 para inexistente, sem auditar', async () => {
      const protocolo = await criarNoBanco('A');
      await http().patch(`${BASE}/${protocolo.id}`).send({}).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ nome: 'X' }).expect(404);
      await expectNoAudit(prisma, { entity: 'Protocolo' });
    });
  });

  describe('DELETE /:id', () => {
    it('exclui logicamente e audita DELETE', async () => {
      const protocolo = await criarNoBanco('A');
      await http().delete(`${BASE}/${protocolo.id}`).expect(200);
      expect((await prisma.protocolo.findUnique({ where: { id: protocolo.id } }))?.deletedAt).not.toBeNull();
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'Protocolo',
        entityId: protocolo.id,
        before: { nome: 'A' },
        userId: usuario.id,
      });
      await http().delete(`${BASE}/${protocolo.id}`).expect(404);
    });

    it('409 se for usado em protocolo mãe, 403 sem permissão', async () => {
      const protocolo = await criarNoBanco('A');
      const mae = await prisma.protocoloMae.create({ data: { nome: 'Mãe' } });
      await prisma.protocoloMaeSemana.create({
        data: { protocoloMaeId: mae.id, semana: 1, protocoloId: protocolo.id },
      });
      const res = await http().delete(`${BASE}/${protocolo.id}`).expect(409);
      expect(res.body.code).toBe('PROTOCOLO_EM_USO');
      await expectNoAudit(prisma, { entity: 'Protocolo' });
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.protocolos.ver'],
      });
      await comUsuario(app, leitor).delete(`${BASE}/${protocolo.id}`).expect(403);
    });
  });

  describe('Protocolos Mãe', () => {
    it('cria com semanas, lista, detalha, altera e exclui, auditando', async () => {
      const protocolo = await criarNoBanco('Limpeza');
      const criada = await http()
        .post(BASE_MAE)
        .send({
          nome: ' Tratamento Facial ',
          totalSemanas: 2,
          valorTotal: 900,
          semanas: [
            { semana: 1, protocoloId: protocolo.id, observacoes: 'Início' },
            { semana: 2, protocoloId: null },
          ],
        })
        .expect(201);
      expect(criada.body).toMatchObject({
        nome: 'Tratamento Facial',
        categoria: 'Geral',
        semanas: [
          { semana: 1, protocoloId: protocolo.id, protocoloNome: 'Limpeza', observacoes: 'Início' },
          { semana: 2, protocoloId: null, protocoloNome: null },
        ],
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ProtocoloMae',
        entityId: criada.body.id,
        before: null,
        userId: usuario.id,
      });

      const lista = protocoloMaePageSchema.parse((await http().get(BASE_MAE).expect(200)).body);
      expect(lista.data.map((m) => m.nome)).toEqual(['Tratamento Facial']);
      await http().get(`${BASE_MAE}/${criada.body.id}`).expect(200);

      const alterada = await http()
        .patch(`${BASE_MAE}/${criada.body.id}`)
        .send({ nome: 'Facial', totalSemanas: 1, semanas: [{ semana: 1 }] })
        .expect(200);
      expect(alterada.body).toMatchObject({ nome: 'Facial', semanas: [{ semana: 1 }] });
      expect(alterada.body.semanas).toHaveLength(1);

      await http().delete(`${BASE_MAE}/${criada.body.id}`).expect(200);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'ProtocoloMae',
        entityId: criada.body.id,
        userId: usuario.id,
      });
      await http().get(`${BASE_MAE}/${criada.body.id}`).expect(404);
    });

    it('400 sem nome, semana fora do total ou protocolo inexistente; 409 para nome repetido', async () => {
      const res = await http().post(BASE_MAE).send({ nome: '' }).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([{ field: 'nome', message: 'Nome é obrigatório.' }]),
      );
      await http()
        .post(BASE_MAE)
        .send({ nome: 'X', totalSemanas: 1, semanas: [{ semana: 2 }] })
        .expect(400);
      const inexistente = await http()
        .post(BASE_MAE)
        .send({ nome: 'X', semanas: [{ semana: 1, protocoloId: INEXISTENTE }] })
        .expect(400);
      expect(inexistente.body.details).toEqual([
        { field: 'semanas.0.protocoloId', message: 'Protocolo inválido' },
      ]);

      await http().post(BASE_MAE).send({ nome: 'Facial' }).expect(201);
      const duplicado = await http().post(BASE_MAE).send({ nome: 'facial' }).expect(409);
      expect(duplicado.body).toMatchObject({
        code: 'PROTOCOLO_MAE_DUPLICADO',
        message: 'Já existe um protocolo mãe com este nome.',
      });
      await http().patch(`${BASE_MAE}/${INEXISTENTE}`).send({ nome: 'Z' }).expect(404);
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE_MAE).expect(403);
    });
  });
});
