import type { INestApplication } from '@nestjs/common';
import { contaReceberPageSchema, contaReceberSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/financeiro/contas-receber';
const ENTITY = 'ContaReceber';
const PERMISSOES = [
  'financeiro.contas-receber.ver',
  'financeiro.contas-receber.criar',
  'financeiro.contas-receber.editar',
  'financeiro.contas-receber.excluir',
  'financeiro.contas-receber.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Contas a Receber (e2e)', () => {
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
    descricao: string,
    extra: Partial<{
      valor: string;
      dataVencimento: Date;
      status: 'PENDENTE' | 'RECEBIDO' | 'CANCELADO';
      pacienteId: string;
      deletedAt: Date;
    }> = {},
  ) {
    return prisma.contaReceber.create({
      data: {
        descricao,
        valor: '100.00',
        dataVencimento: new Date('2026-12-10'),
        ...extra,
      },
    });
  }

  describe('GET (listagem)', () => {
    it('não lista excluídas; filtra por status, período de vencimento e busca', async () => {
      await criarNoBanco('Mensalidade');
      await criarNoBanco('Vencida', { status: 'PENDENTE', dataVencimento: new Date('2026-01-05') });
      await criarNoBanco('Excluída', { deletedAt: new Date() });

      const todas = await http().get(BASE).expect(200);
      expect(contaReceberPageSchema.parse(todas.body).meta.total).toBe(2);

      // "Vencido" não é gravado: é calculado (Pendente com vencimento antes de hoje).
      const vencidas = await http().get(BASE).query({ status: 'VENCIDO' }).expect(200);
      expect(vencidas.body.data.map((c: { descricao: string }) => c.descricao)).toEqual([
        'Vencida',
      ]);

      const periodo = await http()
        .get(BASE)
        .query({ vencimentoDe: '2026-12-01', vencimentoAte: '2026-12-31' })
        .expect(200);
      expect(periodo.body.data.map((c: { descricao: string }) => c.descricao)).toEqual([
        'Mensalidade',
      ]);

      const busca = await http().get(BASE).query({ search: 'vencida' }).expect(200);
      expect(busca.body.data).toHaveLength(1);
      await http().get(BASE).query({ status: 'x' }).expect(400);
    });

    it('403 sem a permissão de ver', async () => {
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(BASE).expect(403);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 para excluída ou inexistente', async () => {
      const conta = await criarNoBanco('Mensalidade');
      const excluida = await criarNoBanco('Excluída', { deletedAt: new Date() });
      const ok = await http().get(`${BASE}/${conta.id}`).expect(200);
      expect(contaReceberSchema.parse(ok.body)).toMatchObject({ descricao: 'Mensalidade' });
      await http().get(`${BASE}/${excluida.id}`).expect(404);
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
    });
  });

  describe('POST (Nova Conta a Receber)', () => {
    it('201: cria com status Pendente por padrão; audita CREATE', async () => {
      const res = await http()
        .post(BASE)
        .send({ descricao: ' Mensalidade ', valor: 150.5, dataVencimento: '2026-12-10' })
        .expect(201);
      expect(contaReceberSchema.parse(res.body)).toMatchObject({
        descricao: 'Mensalidade',
        valor: '150.5',
        dataVencimento: '2026-12-10',
        status: 'PENDENTE',
        pacienteId: null,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { descricao: 'Mensalidade' },
        userId: usuario.id,
      });
    });

    it('400 com descrição, valor e vencimento ausentes, sem auditar', async () => {
      const res = await http().post(BASE).send({}).expect(400);
      expect(res.body.details).toEqual([
        expect.objectContaining({ field: 'descricao', message: 'Descrição é obrigatório.' }),
        expect.objectContaining({ field: 'valor', message: 'Valor é obrigatório.' }),
        expect.objectContaining({
          field: 'dataVencimento',
          message: 'Data de vencimento é obrigatória.',
        }),
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 com valor zero ou negativo', async () => {
      await http()
        .post(BASE)
        .send({ descricao: 'X', valor: 0, dataVencimento: '2026-12-10' })
        .expect(400);
      await http()
        .post(BASE)
        .send({ descricao: 'X', valor: -10, dataVencimento: '2026-12-10' })
        .expect(400);
    });

    it('400 com status VENCIDO: não é gravado, só filtro calculado do grid', async () => {
      await http()
        .post(BASE)
        .send({ descricao: 'X', valor: 10, dataVencimento: '2026-12-10', status: 'VENCIDO' })
        .expect(400);
    });
  });

  describe('PATCH /:id', () => {
    it('200: altera e audita UPDATE com before/after', async () => {
      const conta = await criarNoBanco('Mensalidade');
      const res = await http()
        .patch(`${BASE}/${conta.id}`)
        .send({
          descricao: 'Mensalidade Paga',
          valor: 100,
          dataVencimento: '2026-12-10',
          status: 'RECEBIDO',
        })
        .expect(200);
      expect(res.body).toMatchObject({ descricao: 'Mensalidade Paga', status: 'RECEBIDO' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: conta.id,
        before: { descricao: 'Mensalidade', status: 'PENDENTE' },
        after: { descricao: 'Mensalidade Paga', status: 'RECEBIDO' },
        userId: usuario.id,
      });
    });

    it('200: ao receber grava conta bancária e data (Conciliação, #46); auditado', async () => {
      const banco = await prisma.contaBancaria.create({ data: { nome: 'Banco Teste' } });
      const conta = await criarNoBanco('Mensalidade');
      const res = await http()
        .patch(`${BASE}/${conta.id}`)
        .send({
          descricao: 'Mensalidade',
          valor: 100,
          dataVencimento: '2026-12-10',
          status: 'RECEBIDO',
          contaBancariaId: banco.id,
          dataRecebimento: '2026-12-08',
        })
        .expect(200);
      expect(contaReceberSchema.parse(res.body)).toMatchObject({
        contaBancariaId: banco.id,
        contaBancariaNome: 'Banco Teste',
        dataRecebimento: '2026-12-08',
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: conta.id,
        before: { status: 'PENDENTE', contaBancariaId: null },
        after: { status: 'RECEBIDO', contaBancariaId: banco.id, dataRecebimento: '2026-12-08' },
        userId: usuario.id,
      });

      // Voltar para Pendente limpa conta e data.
      const pendente = await http()
        .patch(`${BASE}/${conta.id}`)
        .send({
          descricao: 'Mensalidade',
          valor: 100,
          dataVencimento: '2026-12-10',
          status: 'PENDENTE',
          contaBancariaId: banco.id,
        })
        .expect(200);
      expect(pendente.body).toMatchObject({ contaBancariaId: null, dataRecebimento: null });
    });

    it('404 ao receber em conta bancária inexistente', async () => {
      const conta = await criarNoBanco('Mensalidade');
      const res = await http()
        .patch(`${BASE}/${conta.id}`)
        .send({
          descricao: 'Mensalidade',
          valor: 100,
          dataVencimento: '2026-12-10',
          status: 'RECEBIDO',
          contaBancariaId: INEXISTENTE,
        })
        .expect(404);
      expect(res.body.details).toEqual([
        expect.objectContaining({
          field: 'contaBancariaId',
          message: 'Conta bancária não encontrada',
        }),
      ]);
    });

    it('400 com campo obrigatório vazio, 404 para inexistente', async () => {
      const conta = await criarNoBanco('Mensalidade');
      await http()
        .patch(`${BASE}/${conta.id}`)
        .send({ descricao: '', valor: 100, dataVencimento: '2026-12-10' })
        .expect(400);
      await http()
        .patch(`${BASE}/${INEXISTENTE}`)
        .send({ descricao: 'X', valor: 100, dataVencimento: '2026-12-10' })
        .expect(404);
    });
  });

  describe('DELETE /:id', () => {
    it('200: exclusão lógica e audita DELETE', async () => {
      const conta = await criarNoBanco('Mensalidade');
      await http().delete(`${BASE}/${conta.id}`).expect(200);

      const banco = await prisma.contaReceber.findUniqueOrThrow({ where: { id: conta.id } });
      expect(banco.deletedAt).not.toBeNull();
      await http().get(`${BASE}/${conta.id}`).expect(404);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: conta.id,
        before: { descricao: 'Mensalidade' },
        after: null,
        userId: usuario.id,
      });
    });

    it('404 para inexistente', async () => {
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
    });
  });

  describe('GET /export (Excel/PDF)', () => {
    it('xlsx com as contas e audita EXPORT', async () => {
      await criarNoBanco('MENSALIDADE OUTUBRO');
      const res = await http()
        .get(`${BASE}/export`)
        .query({ format: 'xlsx' })
        .buffer(true)
        .parse(binario)
        .expect(200);

      const wb = new Workbook();
      await wb.xlsx.load(res.body);
      const linhas = wb.worksheets[0]?.getSheetValues() ?? [];
      expect(JSON.stringify(linhas)).toContain('MENSALIDADE OUTUBRO');
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
