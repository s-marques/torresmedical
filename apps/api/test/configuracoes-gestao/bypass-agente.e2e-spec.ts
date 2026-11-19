import type { INestApplication } from '@nestjs/common';
import { bypassAgentePageSchema, bypassAgenteSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/configuracoes-gestao/bypass-agente';
const PERMISSOES = [
  'configuracoes-gestao.bypass-agente.ver',
  'configuracoes-gestao.bypass-agente.criar',
  'configuracoes-gestao.bypass-agente.editar',
  'configuracoes-gestao.bypass-agente.excluir',
] as const;
const SOMENTE_VER = ['configuracoes-gestao.bypass-agente.ver'] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const ENTITY = 'BypassAgente';

describe('Bypass Agente (e2e)', () => {
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
  const leitor = async () =>
    comUsuario(app, await criarUsuarioTeste(app, { permissoes: SOMENTE_VER }));

  function criarNoBanco(
    telefone: string,
    extra: { nome?: string; cargo?: string; ativo?: boolean; deletedAt?: Date } = {},
  ) {
    return prisma.bypassAgente.create({ data: { telefone, ...extra } });
  }

  describe('GET', () => {
    it('lista por nome, sem excluídos; busca por nome, telefone e cargo; filtra o status', async () => {
      await criarNoBanco('5565900000001', { nome: 'Bruna', cargo: 'Recepção' });
      await criarNoBanco('5565900000002', { nome: 'Ana', cargo: 'Gerente', ativo: false });
      await criarNoBanco('5565900000003', { nome: 'Excluída', deletedAt: new Date() });

      const todos = await http().get(BASE).expect(200);
      const page = bypassAgentePageSchema.parse(todos.body);
      expect(page.data.map((d) => d.nome)).toEqual(['Ana', 'Bruna']);
      expect(page.meta.total).toBe(2);

      const buscar = async (query: Record<string, string>) =>
        (await http().get(BASE).query(query).expect(200)).body.data.map(
          (d: { nome: string }) => d.nome,
        );
      expect(await buscar({ search: 'BRU' })).toEqual(['Bruna']);
      expect(await buscar({ search: '0002' })).toEqual(['Ana']);
      expect(await buscar({ search: 'gerente' })).toEqual(['Ana']);
      expect(await buscar({ status: 'inativo' })).toEqual(['Ana']);
      expect(await buscar({ sort: 'telefone:asc' })).toEqual(['Bruna', 'Ana']);
    });

    it('pagina no servidor', async () => {
      for (let i = 1; i <= 3; i++) await criarNoBanco(`556590000000${i}`, { nome: `N${i}` });
      const res = await http().get(BASE).query({ page: 2, pageSize: 2 }).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    });

    it('400 para sort fora da whitelist e status inválido; 403 sem permissão', async () => {
      await http().get(BASE).query({ sort: 'ativo:asc' }).expect(400);
      await http().get(BASE).query({ status: 'x' }).expect(400);
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE).expect(403);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 (inexistente ou excluído) e 400', async () => {
      const registro = await criarNoBanco('5565900000001', { nome: 'Ana' });
      const excluido = await criarNoBanco('5565900000002', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${registro.id}`).expect(200);
      expect(bypassAgenteSchema.parse(ok.body)).toMatchObject({ nome: 'Ana', ativo: true });
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      await http().get(`${BASE}/${excluido.id}`).expect(404);
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST', () => {
    it('201 normaliza o telefone, nasce ativo e audita CREATE', async () => {
      const res = await http()
        .post(BASE)
        .send({ telefone: '(65) 99999-0000', nome: ' Ana ', cargo: '' })
        .expect(201);

      expect(bypassAgenteSchema.parse(res.body)).toMatchObject({
        telefone: '5565999990000',
        nome: 'Ana',
        cargo: null,
        ativo: true,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, telefone: '5565999990000', nome: 'Ana', ativo: true },
        userId: usuario.id,
      });
    });

    it('400 "Telefone é obrigatório." e campo não permitido, sem auditar', async () => {
      const res = await http().post(BASE).send({ telefone: '', extra: 1 }).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'telefone', message: 'Telefone é obrigatório.' },
          { field: 'extra', message: 'Campo não permitido' },
        ]),
      );
      await http().post(BASE).send({ telefone: '123' }).expect(400);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('409 DUPLICATE para telefone já na lista, mas libera o de um registro excluído', async () => {
      await criarNoBanco('5565999990000');
      await criarNoBanco('5565988880000', { deletedAt: new Date() });

      const res = await http().post(BASE).send({ telefone: '(65) 99999-0000' }).expect(409);
      expect(res.body).toMatchObject({
        code: 'DUPLICATE',
        details: [{ field: 'telefone', message: 'Este telefone já está na lista de bypass' }],
      });
      await expectNoAudit(prisma, { entity: ENTITY });
      await http().post(BASE).send({ telefone: '65988880000' }).expect(201);
    });

    it('403 sem permissão de criar', async () => {
      await (await leitor()).post(BASE).send({ telefone: '65999990000' }).expect(403);
    });
  });

  describe('PATCH /:id', () => {
    it('200 e audita UPDATE com before/after; manter o próprio telefone não é duplicidade', async () => {
      const registro = await criarNoBanco('5565999990000', { nome: 'Ana' });

      const res = await http()
        .patch(`${BASE}/${registro.id}`)
        .send({ telefone: '65999990000', nome: 'Ana Souza', cargo: 'Gerente' })
        .expect(200);

      expect(res.body).toMatchObject({ nome: 'Ana Souza', cargo: 'Gerente' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: registro.id,
        before: { nome: 'Ana', cargo: null },
        after: { nome: 'Ana Souza', cargo: 'Gerente' },
        userId: usuario.id,
      });
    });

    it('409 ao usar o telefone de outro, 404, 400 e 403', async () => {
      await criarNoBanco('5565999990000');
      const registro = await criarNoBanco('5565988880000');

      await http().patch(`${BASE}/${registro.id}`).send({ telefone: '65999990000' }).expect(409);
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ telefone: '65999990000' }).expect(404);
      await http().patch(`${BASE}/${registro.id}`).send({ telefone: '' }).expect(400);
      await (
        await leitor()
      )
        .patch(`${BASE}/${registro.id}`)
        .send({ telefone: '65977770000' })
        .expect(403);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id/status', () => {
    it('desliga e liga o bypass, auditando UPDATE', async () => {
      const registro = await criarNoBanco('5565999990000');

      const res = await http()
        .patch(`${BASE}/${registro.id}/status`)
        .send({ ativo: false })
        .expect(200);
      expect(res.body.ativo).toBe(false);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: registro.id,
        before: { ativo: true },
        after: { ativo: false },
        userId: usuario.id,
      });
      await http().patch(`${BASE}/${registro.id}/status`).send({ ativo: true }).expect(200);
    });

    it('400 sem o booleano, 404 e 403', async () => {
      const registro = await criarNoBanco('5565999990000');
      await http().patch(`${BASE}/${registro.id}/status`).send({ ativo: 'sim' }).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}/status`).send({ ativo: false }).expect(404);
      await (
        await leitor()
      )
        .patch(`${BASE}/${registro.id}/status`)
        .send({ ativo: false })
        .expect(403);
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica, audita DELETE e some da listagem', async () => {
      const registro = await criarNoBanco('5565999990000', { nome: 'Ana' });

      await http().delete(`${BASE}/${registro.id}`).expect(200);

      const gravado = await prisma.bypassAgente.findUniqueOrThrow({ where: { id: registro.id } });
      expect(gravado.deletedAt).not.toBeNull();
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: registro.id,
        before: { nome: 'Ana' },
        userId: usuario.id,
      });
      expect((await http().get(BASE).expect(200)).body.data).toHaveLength(0);
    });

    it('404 e 403', async () => {
      const registro = await criarNoBanco('5565999990000');
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      await (await leitor()).delete(`${BASE}/${registro.id}`).expect(403);
    });
  });
});
