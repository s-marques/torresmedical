import type { INestApplication } from '@nestjs/common';
import { comissaoPageSchema, comissaoSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const ENTITY = 'Comissao';
const PERMISSOES = [
  'regulatorio-qualidade.funcionarios.ver',
  'regulatorio-qualidade.funcionarios.criar',
  'regulatorio-qualidade.funcionarios.editar',
  'regulatorio-qualidade.funcionarios.excluir',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Comissões (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let funcionarioId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    funcionarioId = (await prisma.funcionario.create({ data: { nome: 'Ana' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  function http() {
    return comUsuario(app, usuario);
  }

  function base(id = funcionarioId) {
    return `/api/regulatorio-qualidade/funcionarios/${id}/comissoes`;
  }

  function criarNoBanco(
    valor: number,
    extra: { status?: 'PENDENTE' | 'PAGA'; deletedAt?: Date } = {},
  ) {
    return prisma.comissao.create({
      data: { funcionarioId, valor, dataReferencia: new Date('2026-01-15'), ...extra },
    });
  }

  describe('GET (listagem)', () => {
    it('lista só as comissões do funcionário, sem excluídas', async () => {
      await criarNoBanco(100);
      await criarNoBanco(200, { deletedAt: new Date() });
      const outro = (await prisma.funcionario.create({ data: { nome: 'Outro' } })).id;
      await prisma.comissao.create({
        data: { funcionarioId: outro, valor: 300, dataReferencia: new Date() },
      });

      const res = await http().get(base()).expect(200);
      const page = comissaoPageSchema.parse(res.body);
      expect(page.data).toHaveLength(1);
      expect(page.data[0]).toMatchObject({ valor: '100', status: 'pendente' });
    });

    it('filtra por status', async () => {
      await criarNoBanco(100, { status: 'PAGA' });
      await criarNoBanco(200, { status: 'PENDENTE' });
      const res = await http().get(base()).query({ status: 'paga' }).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('paga');
    });
  });

  describe('POST (lançar comissão)', () => {
    it('201: lança com status pendente padrão; audita CREATE', async () => {
      const res = await http()
        .post(base())
        .send({ valor: 150.5, dataReferencia: '2026-02-01', descricao: 'Venda X' })
        .expect(201);

      expect(comissaoSchema.parse(res.body)).toMatchObject({
        funcionarioId,
        valor: '150.5',
        status: 'pendente',
        descricao: 'Venda X',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        userId: usuario.id,
      });
    });

    it('400 sem valor e sem data de referência, sem auditar', async () => {
      const res = await http().post(base()).send({}).expect(400);
      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'dataReferencia',
        'valor',
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id (editar comissão)', () => {
    it('200: altera status para paga e audita UPDATE', async () => {
      const comissao = await criarNoBanco(100);
      const res = await http()
        .patch(`${base()}/${comissao.id}`)
        .send({ valor: 100, dataReferencia: '2026-01-15', status: 'paga' })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'paga' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: comissao.id,
        userId: usuario.id,
      });
    });

    it('404 comissão de outro funcionário', async () => {
      const comissao = await criarNoBanco(100);
      const outro = (await prisma.funcionario.create({ data: { nome: 'Outro' } })).id;
      await http()
        .patch(`${base(outro)}/${comissao.id}`)
        .send({ valor: 100, dataReferencia: '2026-01-15' })
        .expect(404);
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const comissao = await criarNoBanco(100);
      await http().delete(`${base()}/${comissao.id}`).expect(200);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: comissao.id,
        after: null,
        userId: usuario.id,
      });
      const listagem = await http().get(base()).expect(200);
      expect(listagem.body.data).toHaveLength(0);
    });

    it('404 inexistente, sem auditar', async () => {
      await http().delete(`${base()}/${INEXISTENTE}`).expect(404);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('acesso', () => {
    it('sem a permissão criar responde 403, sem auditar', async () => {
      const semPermissao = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES.filter((p) => !p.endsWith('.criar')),
      });
      const res = await comUsuario(app, semPermissao)
        .post(base())
        .send({ valor: 1, dataReferencia: '2026-01-01' })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });
});
