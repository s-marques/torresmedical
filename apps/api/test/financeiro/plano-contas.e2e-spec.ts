import type { INestApplication } from '@nestjs/common';
import { planoContaListaSchema, planoContaSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/financeiro/plano-contas';
const ENTITY = 'PlanoConta';
const PERMISSOES = [
  'financeiro.plano-contas.ver',
  'financeiro.plano-contas.criar',
  'financeiro.plano-contas.editar',
  'financeiro.plano-contas.excluir',
  'financeiro.plano-contas.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Plano de Contas (e2e)', () => {
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
    codigo: string,
    extra: Partial<{
      nome: string;
      tipo: 'RECEITA' | 'DESPESA' | 'ATIVO' | 'PASSIVO';
      nivel: number;
      contaPaiId: string;
      ativo: boolean;
      deletedAt: Date;
    }> = {},
  ) {
    return prisma.planoConta.create({
      data: { codigo, nome: `Conta ${codigo}`, tipo: 'DESPESA', ...extra },
    });
  }

  describe('GET (listagem)', () => {
    it('ordena os códigos de forma natural, sem excluídas, e filtra por tipo e busca', async () => {
      await criarNoBanco('6.10');
      await criarNoBanco('6.2');
      await criarNoBanco('1', { tipo: 'ATIVO', nome: 'ATIVO' });
      await criarNoBanco('9', { deletedAt: new Date() });

      const res = await http().get(BASE).expect(200);
      const lista = planoContaListaSchema.parse(res.body);
      expect(lista.data.map((c) => c.codigo)).toEqual(['1', '6.2', '6.10']);
      expect(lista.total).toBe(3);

      const ativos = await http().get(BASE).query({ tipo: 'ativo' }).expect(200);
      expect(ativos.body.data.map((c: { codigo: string }) => c.codigo)).toEqual(['1']);
      const busca = await http().get(BASE).query({ search: 'ativo' }).expect(200);
      expect(busca.body.data).toHaveLength(1);
      await http().get(BASE).query({ tipo: 'x' }).expect(400);
    });

    it('403 sem a permissão de ver', async () => {
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(BASE).expect(403);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 para excluída ou inexistente', async () => {
      const conta = await criarNoBanco('1');
      const excluida = await criarNoBanco('2', { deletedAt: new Date() });
      const ok = await http().get(`${BASE}/${conta.id}`).expect(200);
      expect(planoContaSchema.parse(ok.body)).toMatchObject({ codigo: '1', nivel: 1 });
      await http().get(`${BASE}/${excluida.id}`).expect(404);
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
    });
  });

  describe('POST (Nova Conta)', () => {
    it('201: conta raiz no nível 1; audita CREATE', async () => {
      const res = await http()
        .post(BASE)
        .send({ codigo: ' 7 ', tipo: 'receita', nome: ' Receitas ' })
        .expect(201);
      expect(planoContaSchema.parse(res.body)).toMatchObject({
        codigo: '7',
        nome: 'Receitas',
        tipo: 'RECEITA',
        nivel: 1,
        contaPaiId: null,
        ativo: true,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { codigo: '7', tipo: 'RECEITA' },
        userId: usuario.id,
      });
    });

    it('201: subconta fica no nível do pai + 1', async () => {
      const pai = await criarNoBanco('6');
      const res = await http()
        .post(BASE)
        .send({ codigo: '6.1', tipo: 'despesa', nome: 'Filha', contaPaiId: pai.id })
        .expect(201);
      expect(res.body).toMatchObject({ nivel: 2, contaPaiId: pai.id });
    });

    it('400 com código, tipo e nome ausentes, sem auditar', async () => {
      const res = await http().post(BASE).send({}).expect(400);
      expect(res.body.details).toEqual([
        { field: 'codigo', message: 'Código é obrigatório.' },
        { field: 'tipo', message: 'Tipo é obrigatório.' },
        { field: 'nome', message: 'Nome é obrigatório.' },
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('409 com código repetido e 404 com pai inexistente', async () => {
      await criarNoBanco('6');
      const dup = await http()
        .post(BASE)
        .send({ codigo: '6', tipo: 'despesa', nome: 'X' })
        .expect(409);
      expect(dup.body.code).toBe('DUPLICATE');
      await http()
        .post(BASE)
        .send({ codigo: '8', tipo: 'despesa', nome: 'X', contaPaiId: INEXISTENTE })
        .expect(404);
    });
  });

  describe('PATCH /:id', () => {
    it('200: altera e audita UPDATE com before/after', async () => {
      const conta = await criarNoBanco('6');
      const res = await http()
        .patch(`${BASE}/${conta.id}`)
        .send({ nome: 'Despesas', tipo: 'passivo' })
        .expect(200);
      expect(res.body).toMatchObject({ nome: 'Despesas', tipo: 'PASSIVO' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: conta.id,
        before: { nome: 'Conta 6', tipo: 'DESPESA' },
        after: { nome: 'Despesas', tipo: 'PASSIVO' },
        userId: usuario.id,
      });
    });

    it('o interruptor desativa e ativa de novo, sem tocar nas filhas', async () => {
      const pai = await criarNoBanco('6');
      const filha = await criarNoBanco('6.1', { contaPaiId: pai.id, nivel: 2 });

      const off = await http().patch(`${BASE}/${pai.id}`).send({ ativo: false }).expect(200);
      expect(off.body.ativo).toBe(false);
      expect((await prisma.planoConta.findUniqueOrThrow({ where: { id: filha.id } })).ativo).toBe(
        true,
      );
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: pai.id,
        before: { ativo: true },
        after: { ativo: false },
        userId: usuario.id,
      });

      const on = await http().patch(`${BASE}/${pai.id}`).send({ ativo: true }).expect(200);
      expect(on.body.ativo).toBe(true);
    });

    it('mover para outro pai recalcula o nível das descendentes', async () => {
      const a = await criarNoBanco('1');
      const b = await criarNoBanco('2');
      const b1 = await criarNoBanco('2.1', { contaPaiId: b.id, nivel: 2 });
      const b11 = await criarNoBanco('2.1.1', { contaPaiId: b1.id, nivel: 3 });

      await http().patch(`${BASE}/${b.id}`).send({ contaPaiId: a.id }).expect(200);

      const niveis = await prisma.planoConta.findMany({
        where: { id: { in: [b.id, b1.id, b11.id] } },
        orderBy: { codigo: 'asc' },
      });
      expect(niveis.map((c) => c.nivel)).toEqual([2, 3, 4]);
    });

    it('422 ao tornar a conta filha de uma descendente', async () => {
      const pai = await criarNoBanco('6');
      const filha = await criarNoBanco('6.1', { contaPaiId: pai.id, nivel: 2 });
      await http().patch(`${BASE}/${pai.id}`).send({ contaPaiId: filha.id }).expect(422);
      await http().patch(`${BASE}/${pai.id}`).send({ contaPaiId: pai.id }).expect(422);
    });

    it('400 sem campos, 404 para inexistente', async () => {
      const conta = await criarNoBanco('6');
      await http().patch(`${BASE}/${conta.id}`).send({}).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ nome: 'X' }).expect(404);
    });
  });

  describe('DELETE /:id', () => {
    it('200: exclusão lógica, libera o código e audita DELETE', async () => {
      const conta = await criarNoBanco('6');
      await http().delete(`${BASE}/${conta.id}`).expect(200);

      const banco = await prisma.planoConta.findUniqueOrThrow({ where: { id: conta.id } });
      expect(banco.deletedAt).not.toBeNull();
      await http().get(`${BASE}/${conta.id}`).expect(404);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: conta.id,
        before: { codigo: '6' },
        after: null,
        userId: usuario.id,
      });

      await http().post(BASE).send({ codigo: '6', tipo: 'despesa', nome: 'Nova' }).expect(201);
    });

    it('422 com subcontas, sem auditar', async () => {
      const pai = await criarNoBanco('6');
      await criarNoBanco('6.1', { contaPaiId: pai.id, nivel: 2 });
      const res = await http().delete(`${BASE}/${pai.id}`).expect(422);
      expect(res.body.message).toContain('subcontas');
      await expectNoAudit(prisma, { entity: ENTITY, action: 'DELETE' });
    });

    it('404 para inexistente', async () => {
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
    });
  });

  describe('GET /export (Imprimir)', () => {
    it('xlsx com as contas e audita EXPORT', async () => {
      await criarNoBanco('6', { nome: 'DESPESAS' });
      const res = await http()
        .get(`${BASE}/export`)
        .query({ format: 'xlsx' })
        .buffer(true)
        .parse(binario)
        .expect(200);

      const wb = new Workbook();
      await wb.xlsx.load(res.body);
      const linhas = wb.worksheets[0]?.getSheetValues() ?? [];
      expect(JSON.stringify(linhas)).toContain('DESPESAS');
      const auditoria = await prisma.auditLog.findMany({
        where: { entity: ENTITY, action: 'EXPORT' },
      });
      expect(auditoria).toHaveLength(1);
    });

    it('400 sem formato', async () => {
      await http().get(`${BASE}/export`).expect(400);
    });
  });
});

function binario(res: request.Response, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
