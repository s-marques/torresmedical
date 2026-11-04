import type { INestApplication } from '@nestjs/common';
import { cargoPageSchema, cargoSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/regulatorio-qualidade/cargos';
const ENTITY = 'Cargo';
const PERMISSOES = [
  'regulatorio-qualidade.funcionarios.ver',
  'regulatorio-qualidade.funcionarios.criar',
  'regulatorio-qualidade.funcionarios.editar',
  'regulatorio-qualidade.funcionarios.excluir',
  'regulatorio-qualidade.funcionarios.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const MSG_NOME = 'Nome é obrigatório.';

describe('Cargos (e2e)', () => {
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

  function criarNoBanco(
    nome: string,
    extra: { departamento?: string; ativo?: boolean; deletedAt?: Date } = {},
  ) {
    return prisma.cargo.create({ data: { nome, ...extra } });
  }

  const nomes = (body: { data: { nome: string }[] }) => body.data.map((c) => c.nome);

  describe('GET (listagem)', () => {
    it('padrão: nome crescente, sem excluídos', async () => {
      await criarNoBanco('Recepcionista', { departamento: 'Atendimento' });
      await criarNoBanco('Gerente');
      await criarNoBanco('Inativo', { ativo: false });
      await criarNoBanco('Excluído', { deletedAt: new Date() });

      const res = await http().get(BASE).expect(200);
      const page = cargoPageSchema.parse(res.body);
      expect(nomes(page)).toEqual(['Gerente', 'Inativo', 'Recepcionista']);
    });
  });

  describe('POST (Novo Cargo)', () => {
    it('201: só com o nome fica ativo; audita CREATE', async () => {
      const res = await http().post(BASE).send({ nome: 'Recepcionista' }).expect(201);
      expect(cargoSchema.parse(res.body)).toMatchObject({ nome: 'Recepcionista', ativo: true });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        userId: usuario.id,
      });
    });

    it('201 com departamento, descrição e salário base', async () => {
      const res = await http()
        .post(BASE)
        .send({
          nome: 'Gerente',
          departamento: 'Diretoria',
          descricao: 'Gestão',
          salarioBase: 8000,
        })
        .expect(201);
      expect(res.body).toMatchObject({
        departamento: 'Diretoria',
        descricao: 'Gestão',
        salarioBase: '8000',
      });
    });

    it(`400 "${MSG_NOME}" com o nome vazio, sem auditar`, async () => {
      const res = await http().post(BASE).send({ nome: '' }).expect(400);
      expect(res.body.details).toEqual([{ field: 'nome', message: MSG_NOME }]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id (Editar Cargo)', () => {
    it('200: altera e audita UPDATE', async () => {
      const cargo = await criarNoBanco('Recepcionista');
      const res = await http()
        .patch(`${BASE}/${cargo.id}`)
        .send({ nome: 'Recepcionista Chefe', status: 'inativo' })
        .expect(200);
      expect(res.body).toMatchObject({ nome: 'Recepcionista Chefe', ativo: false });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: cargo.id,
        before: { nome: 'Recepcionista', ativo: true },
        after: { nome: 'Recepcionista Chefe', ativo: false },
        userId: usuario.id,
      });
    });

    it('404 inexistente, sem auditar', async () => {
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ nome: 'Y' }).expect(404);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200 e audita DELETE', async () => {
      const cargo = await criarNoBanco('Recepcionista');
      await http().delete(`${BASE}/${cargo.id}`).expect(200);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: cargo.id,
        before: { nome: 'Recepcionista', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
    });

    it('404 inexistente, sem auditar', async () => {
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('GET /export', () => {
    function binary(req: request.Test) {
      return req.buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    }

    it('xlsx com filtro e ordenação; audita EXPORT', async () => {
      await criarNoBanco('Beta', { departamento: 'Atendimento' });
      await criarNoBanco('Alfa');
      await criarNoBanco('Gama', { ativo: false });

      const res = await binary(
        http().get(`${BASE}/export`).query({ format: 'xlsx', status: 'ativo', sort: 'nome:asc' }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows[0]).toEqual(['Nome', 'Departamento', 'Descrição', 'Salário Base', 'Status']);
      expect(rows.slice(1).map((r) => r[0])).toEqual(['Alfa', 'Beta']);
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTITY,
        entityId: '*',
        userId: usuario.id,
      });
    });

    it('400 para colunas inválidas, sem auditar', async () => {
      const res = await http()
        .get(`${BASE}/export`)
        .query({ format: 'xlsx', columns: 'senha' })
        .expect(400);
      expect(res.body.details[0].field).toBe('columns');
      await expectNoAudit(prisma, { entity: ENTITY, action: 'EXPORT' });
    });
  });

  describe('acesso', () => {
    it('sem a permissão criar responde 403, sem auditar', async () => {
      const semPermissao = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES.filter((p) => !p.endsWith('.criar')),
      });
      const res = await comUsuario(app, semPermissao).post(BASE).send({ nome: 'X' }).expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });
});
