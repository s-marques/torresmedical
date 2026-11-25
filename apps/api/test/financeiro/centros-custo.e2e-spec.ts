import type { INestApplication } from '@nestjs/common';
import { centroCustoPageSchema, centroCustoSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/financeiro/centros-custo';
const LOOKUP = '/api/lookups/centros-custo';
const ENTITY = 'CentroCusto';
const PERMISSOES = [
  'financeiro.contas-pagar.ver',
  'financeiro.contas-pagar.criar',
  'financeiro.contas-pagar.editar',
  'financeiro.contas-pagar.excluir',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Centros de Custo (e2e)', () => {
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

  function http() {
    return comUsuario(app, usuario);
  }

  describe('GET (listagem)', () => {
    it('lista os não excluídos, com busca e ordenação por nome', async () => {
      await prisma.centroCusto.createMany({
        data: [
          { nome: 'Clínico' },
          { nome: 'Administrativo' },
          { nome: 'Excluído', deletedAt: new Date() },
        ],
      });
      const res = await http().get(BASE).expect(200);
      const pagina = centroCustoPageSchema.parse(res.body);
      expect(pagina.data.map((c) => c.nome)).toEqual(['Administrativo', 'Clínico']);
      expect(pagina.meta.total).toBe(2);

      const busca = await http().get(BASE).query({ search: 'cl' }).expect(200);
      expect(busca.body.data).toHaveLength(1);
      await http().get(BASE).query({ sort: 'x:asc' }).expect(400);
    });

    it('403 sem a permissão de ver', async () => {
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(BASE).expect(403);
    });
  });

  describe('POST', () => {
    it('201: cria e audita CREATE', async () => {
      const res = await http().post(BASE).send({ nome: ' Administrativo ' }).expect(201);
      expect(centroCustoSchema.parse(res.body)).toMatchObject({
        nome: 'Administrativo',
        ativo: true,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { nome: 'Administrativo', ativo: true },
        userId: usuario.id,
      });
    });

    it('409 com nome repetido (sem diferenciar maiúsculas), sem auditar', async () => {
      await prisma.centroCusto.create({ data: { nome: 'Administrativo' } });
      const res = await http().post(BASE).send({ nome: 'administrativo' }).expect(409);
      expect(res.body.code).toBe('DUPLICATE');
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 sem nome, sem auditar', async () => {
      const res = await http().post(BASE).send({}).expect(400);
      expect(res.body.details).toEqual([
        expect.objectContaining({ field: 'nome', message: 'Nome é obrigatório.' }),
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('403 sem a permissão de criar', async () => {
      const sem = await criarUsuarioTeste(app, { permissoes: ['financeiro.contas-pagar.ver'] });
      await comUsuario(app, sem).post(BASE).send({ nome: 'X' }).expect(403);
    });
  });

  describe('PATCH /:id', () => {
    it('200: renomeia e desativa; audita UPDATE com before/after', async () => {
      const centro = await prisma.centroCusto.create({ data: { nome: 'Clínico' } });
      await http().patch(`${BASE}/${centro.id}`).send({ nome: 'Assistencial' }).expect(200);
      await http().patch(`${BASE}/${centro.id}`).send({ ativo: false }).expect(200);
      const auditoria = await prisma.auditLog.findMany({
        where: { entity: ENTITY, action: 'UPDATE', entityId: centro.id },
        orderBy: { occurredAt: 'asc' },
      });
      expect(auditoria).toHaveLength(2);
      expect(auditoria[0]).toMatchObject({
        before: { nome: 'Clínico' },
        after: { nome: 'Assistencial' },
      });
      expect(auditoria[1]).toMatchObject({ before: { ativo: true }, after: { ativo: false } });
    });

    it('409 ao renomear para um nome já usado por outro; manter o próprio nome é permitido', async () => {
      const a = await prisma.centroCusto.create({ data: { nome: 'A' } });
      await prisma.centroCusto.create({ data: { nome: 'B' } });
      await http().patch(`${BASE}/${a.id}`).send({ nome: 'b' }).expect(409);
      await http().patch(`${BASE}/${a.id}`).send({ nome: 'A' }).expect(200);
    });

    it('400 sem nenhum campo; 404 para inexistente', async () => {
      const centro = await prisma.centroCusto.create({ data: { nome: 'A' } });
      await http().patch(`${BASE}/${centro.id}`).send({}).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ nome: 'X' }).expect(404);
    });
  });

  describe('DELETE /:id', () => {
    it('200: exclusão lógica e audita DELETE; some da listagem e do lookup', async () => {
      const centro = await prisma.centroCusto.create({ data: { nome: 'Clínico' } });
      await http().delete(`${BASE}/${centro.id}`).expect(200);
      const banco = await prisma.centroCusto.findUniqueOrThrow({ where: { id: centro.id } });
      expect(banco.deletedAt).not.toBeNull();
      expect((await http().get(BASE).expect(200)).body.data).toEqual([]);
      expect((await http().get(LOOKUP).expect(200)).body.data).toEqual([]);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: centro.id,
        before: { nome: 'Clínico' },
        after: null,
        userId: usuario.id,
      });
    });

    it('404 para inexistente', async () => {
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
    });
  });

  describe('lookup (combobox de Contas a Pagar)', () => {
    it('oferece só os ativos e devolve qualquer um pelo id', async () => {
      const ativo = await prisma.centroCusto.create({ data: { nome: 'Ativo' } });
      const inativo = await prisma.centroCusto.create({ data: { nome: 'Inativo', ativo: false } });
      const lista = await http().get(LOOKUP).expect(200);
      expect(lista.body.data).toEqual([{ id: ativo.id, label: 'Ativo', descricao: null }]);
      await http().get(`${LOOKUP}/${inativo.id}`).expect(200);
      await http().get(`${LOOKUP}/${INEXISTENTE}`).expect(404);
    });
  });
});
