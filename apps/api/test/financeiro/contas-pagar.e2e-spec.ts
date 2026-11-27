import type { INestApplication } from '@nestjs/common';
import {
  contaPagarDivergenciaPageSchema,
  contaPagarPageSchema,
  contaPagarSchema,
} from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/financeiro/contas-pagar';
const ENTITY = 'ContaPagar';
const PERMISSOES = [
  'financeiro.contas-pagar.ver',
  'financeiro.contas-pagar.criar',
  'financeiro.contas-pagar.editar',
  'financeiro.contas-pagar.excluir',
  'financeiro.contas-pagar.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const ARQUIVO_ID = '00000000-0000-4000-8000-0000000000a1';

describe('Contas a Pagar (e2e)', () => {
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

  function criarFornecedor(nome = 'Distribuidora Alfa') {
    return prisma.fornecedor.create({ data: { nome } });
  }

  function criarNoBanco(
    descricao: string,
    extra: Partial<{
      valor: string;
      dataVencimento: Date;
      status: 'PENDENTE' | 'PAGO' | 'CANCELADO';
      fornecedorId: string;
      deletedAt: Date;
      aprovacao: 'LANCADA' | 'APROVADA' | 'RECUSADA';
    }> = {},
  ) {
    return prisma.contaPagar.create({
      data: {
        descricao,
        valor: '100.00',
        dataVencimento: new Date('2026-12-10'),
        // As contas já nascem aprovadas aqui; a aprovação tem o e2e próprio (contas-pagar-aprovacao).
        aprovacao: 'APROVADA',
        ...extra,
      },
    });
  }

  describe('GET (listagem)', () => {
    it('não lista excluídas; filtra por status, período de vencimento e busca', async () => {
      await criarNoBanco('Água');
      await criarNoBanco('Vencida', { dataVencimento: new Date('2026-01-05') });
      await criarNoBanco('Excluída', { deletedAt: new Date() });

      const todas = await http().get(BASE).expect(200);
      expect(contaPagarPageSchema.parse(todas.body).meta.total).toBe(2);

      const vencidas = await http().get(BASE).query({ status: 'VENCIDO' }).expect(200);
      expect(vencidas.body.data.map((c: { descricao: string }) => c.descricao)).toEqual([
        'Vencida',
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
    it('200 com o nome do fornecedor resolvido; 404 para excluída ou inexistente', async () => {
      const fornecedor = await criarFornecedor();
      const conta = await criarNoBanco('Água', { fornecedorId: fornecedor.id });
      const excluida = await criarNoBanco('Excluída', { deletedAt: new Date() });
      const ok = await http().get(`${BASE}/${conta.id}`).expect(200);
      expect(contaPagarSchema.parse(ok.body)).toMatchObject({
        descricao: 'Água',
        beneficiarioNome: 'Distribuidora Alfa',
        valorPago: '0',
      });
      await http().get(`${BASE}/${excluida.id}`).expect(404);
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
    });
  });

  describe('POST (Nova Conta a Pagar)', () => {
    it('201: cria com beneficiário Fornecedor; audita CREATE', async () => {
      const fornecedor = await criarFornecedor();
      const res = await http()
        .post(BASE)
        .send({
          descricao: ' Água ',
          beneficiarioTipo: 'FORNECEDOR',
          beneficiarioId: fornecedor.id,
          valor: 150.5,
          dataVencimento: '2026-12-10',
        })
        .expect(201);
      expect(contaPagarSchema.parse(res.body)).toMatchObject({
        descricao: 'Água',
        status: 'PENDENTE',
        beneficiarioNome: 'Distribuidora Alfa',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { descricao: 'Água' },
        userId: usuario.id,
      });
    });

    it('404 com beneficiário (fornecedor) inexistente', async () => {
      await http()
        .post(BASE)
        .send({
          descricao: 'X',
          beneficiarioTipo: 'FORNECEDOR',
          beneficiarioId: INEXISTENTE,
          valor: 10,
          dataVencimento: '2026-12-10',
        })
        .expect(404);
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
  });

  describe('PATCH /:id', () => {
    it('200: altera e audita UPDATE com before/after', async () => {
      const conta = await criarNoBanco('Água');
      const res = await http()
        .patch(`${BASE}/${conta.id}`)
        .send({ descricao: 'Água Paga', valor: 100, dataVencimento: '2026-12-10', status: 'PAGO' })
        .expect(200);
      expect(res.body).toMatchObject({ descricao: 'Água Paga', status: 'PAGO' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: conta.id,
        before: { descricao: 'Água', status: 'PENDENTE' },
        after: { descricao: 'Água Paga', status: 'PAGO' },
        userId: usuario.id,
      });
    });

    it('404 para inexistente', async () => {
      await http()
        .patch(`${BASE}/${INEXISTENTE}`)
        .send({ descricao: 'X', valor: 100, dataVencimento: '2026-12-10' })
        .expect(404);
    });
  });

  describe('POST /:id/baixar e /:id/cancelar-baixa', () => {
    it('baixa integral quita a conta; cancelar baixa volta para Pendente', async () => {
      const conta = await criarNoBanco('Água', { valor: '100.00' });

      const pago = await http()
        .post(`${BASE}/${conta.id}/baixar`)
        .send({ dataPagamento: '2026-11-04', valorPago: 100 })
        .expect(200);
      expect(pago.body).toMatchObject({ status: 'PAGO', valorPago: '100' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: conta.id,
        before: { status: 'PENDENTE' },
        after: { status: 'PAGO' },
        userId: usuario.id,
      });

      const baixas = await http().get(`${BASE}/${conta.id}/baixas`).expect(200);
      expect(baixas.body).toHaveLength(1);

      const cancelado = await http().post(`${BASE}/${conta.id}/cancelar-baixa`).expect(200);
      expect(cancelado.body).toMatchObject({ status: 'PENDENTE', valorPago: '0' });
      expect((await http().get(`${BASE}/${conta.id}/baixas`).expect(200)).body).toHaveLength(0);
    });

    it('baixa parcial mantém Pendente até completar o valor', async () => {
      const conta = await criarNoBanco('Água', { valor: '100.00' });

      const parcial = await http()
        .post(`${BASE}/${conta.id}/baixar`)
        .send({ dataPagamento: '2026-11-04', valorPago: 60, pagamentoParcial: true })
        .expect(200);
      expect(parcial.body).toMatchObject({ status: 'PENDENTE', valorPago: '60' });

      const completo = await http()
        .post(`${BASE}/${conta.id}/baixar`)
        .send({ dataPagamento: '2026-11-05', valorPago: 40 })
        .expect(200);
      expect(completo.body).toMatchObject({ status: 'PAGO', valorPago: '100' });
    });

    it('422 ao baixar conta já paga ou cancelada; 422 ao cancelar sem baixa', async () => {
      const paga = await criarNoBanco('Paga', { status: 'PAGO' });
      await http()
        .post(`${BASE}/${paga.id}/baixar`)
        .send({ dataPagamento: '2026-11-04', valorPago: 10 })
        .expect(422);

      const semBaixa = await criarNoBanco('Sem baixa');
      await http().post(`${BASE}/${semBaixa.id}/cancelar-baixa`).expect(422);
    });

    it('400 sem data de pagamento ou valor pago', async () => {
      const conta = await criarNoBanco('Água');
      await http().post(`${BASE}/${conta.id}/baixar`).send({}).expect(400);
    });
  });

  describe('competência, centro de custo e anexo do documento (#163)', () => {
    it('201: grava competência, centro de custo e anexo; audita CREATE com os campos', async () => {
      const centro = await prisma.centroCusto.create({ data: { nome: 'Administrativo' } });
      const res = await http()
        .post(BASE)
        .send({
          descricao: 'Energia',
          valor: 300,
          dataVencimento: '2026-12-10',
          competencia: '2026-11',
          centroCustoId: centro.id,
          documentoArquivoId: ARQUIVO_ID,
        })
        .expect(201);
      expect(contaPagarSchema.parse(res.body)).toMatchObject({
        competencia: '2026-11',
        centroCustoId: centro.id,
        centroCustoNome: 'Administrativo',
        documentoArquivoId: ARQUIVO_ID,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { competencia: '2026-11', centroCustoId: centro.id, documentoArquivoId: ARQUIVO_ID },
        userId: usuario.id,
      });
    });

    it('PATCH altera competência e centro de custo; audita before/after', async () => {
      const centro = await prisma.centroCusto.create({ data: { nome: 'Clínico' } });
      const conta = await criarNoBanco('Energia');
      await http()
        .patch(`${BASE}/${conta.id}`)
        .send({
          descricao: 'Energia',
          valor: 100,
          dataVencimento: '2026-12-10',
          competencia: '2026-10',
          centroCustoId: centro.id,
        })
        .expect(200);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: conta.id,
        before: { competencia: null, centroCustoId: null },
        after: { competencia: '2026-10', centroCustoId: centro.id },
        userId: usuario.id,
      });
    });

    it('400 com competência fora do formato AAAA-MM, sem auditar', async () => {
      const res = await http()
        .post(BASE)
        .send({ descricao: 'X', valor: 10, dataVencimento: '2026-12-10', competencia: '11/2026' })
        .expect(400);
      expect(res.body.details).toEqual([expect.objectContaining({ field: 'competencia' })]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('404 com centro de custo inexistente e 422 com centro inativo', async () => {
      const base = { descricao: 'X', valor: 10, dataVencimento: '2026-12-10' };
      await http()
        .post(BASE)
        .send({ ...base, centroCustoId: INEXISTENTE })
        .expect(404);
      const inativo = await prisma.centroCusto.create({ data: { nome: 'Antigo', ativo: false } });
      await http()
        .post(BASE)
        .send({ ...base, centroCustoId: inativo.id })
        .expect(422);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('alerta de duplicidade (#163)', () => {
    const titulo = (fornecedorId: string) => ({
      descricao: 'Energia',
      beneficiarioTipo: 'FORNECEDOR',
      beneficiarioId: fornecedorId,
      valor: 300,
      dataVencimento: '2026-12-10',
    });

    /** Corpo de `POST /duplicidade`: só os campos que identificam o título. */
    const consulta = (fornecedorId: string) => ({
      beneficiarioTipo: 'FORNECEDOR',
      beneficiarioId: fornecedorId,
      valor: 300,
      dataVencimento: '2026-12-10',
    });

    it('lançar a mesma conta duas vezes dá 409 até confirmar; a confirmação é auditada', async () => {
      const fornecedor = await criarFornecedor();
      const primeira = await http().post(BASE).send(titulo(fornecedor.id)).expect(201);

      const segunda = await http().post(BASE).send(titulo(fornecedor.id)).expect(409);
      expect(segunda.body.code).toBe('CONTA_PAGAR_POSSIVEL_DUPLICADA');
      expect(await prisma.contaPagar.count()).toBe(1);

      const confirmada = await http()
        .post(BASE)
        .send({ ...titulo(fornecedor.id), duplicidadeConfirmada: true })
        .expect(201);
      expect(await prisma.contaPagar.count()).toBe(2);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ContaPagarDuplicidade',
        entityId: confirmada.body.id,
        before: null,
        after: {
          duplicidadeConfirmada: true,
          possiveisDuplicadas: [{ id: primeira.body.id, motivos: ['MESMO_TITULO'] }],
        },
        userId: usuario.id,
      });
    });

    it('mesmo número de documento também avisa, mesmo com valor e fornecedor diferentes', async () => {
      await http()
        .post(BASE)
        .send({ descricao: 'A', valor: 10, dataVencimento: '2026-12-10', documento: 'NF-77' })
        .expect(201);
      const res = await http()
        .post(BASE)
        .send({ descricao: 'B', valor: 99, dataVencimento: '2027-01-10', documento: 'nf-77' })
        .expect(409);
      expect(res.body.code).toBe('CONTA_PAGAR_POSSIVEL_DUPLICADA');
    });

    it('conta cancelada ou excluída não conta como duplicidade', async () => {
      const fornecedor = await criarFornecedor();
      await criarNoBanco('Cancelada', {
        fornecedorId: fornecedor.id,
        valor: '300.00',
        dataVencimento: new Date('2026-12-10'),
        status: 'CANCELADO',
      });
      await http().post(BASE).send(titulo(fornecedor.id)).expect(201);
    });

    it('editar sem mudar o título não pede confirmação de novo', async () => {
      const fornecedor = await criarFornecedor();
      const conta = await http().post(BASE).send(titulo(fornecedor.id)).expect(201);
      await http()
        .patch(`${BASE}/${conta.body.id}`)
        .send({ ...titulo(fornecedor.id), observacoes: 'Revisada' })
        .expect(200);
    });

    it('POST /duplicidade devolve os candidatos com o motivo, sem gravar nada', async () => {
      const fornecedor = await criarFornecedor();
      const existente = await http().post(BASE).send(titulo(fornecedor.id)).expect(201);
      const res = await http()
        .post(`${BASE}/duplicidade`)
        .send(consulta(fornecedor.id))
        .expect(200);
      expect(res.body.candidatos).toEqual([
        expect.objectContaining({
          id: existente.body.id,
          beneficiarioNome: 'Distribuidora Alfa',
          motivos: ['MESMO_TITULO'],
        }),
      ]);
      const vazio = await http()
        .post(`${BASE}/duplicidade`)
        .send({ ...consulta(fornecedor.id), valor: 1 })
        .expect(200);
      expect(vazio.body.candidatos).toEqual([]);
      expect(await prisma.contaPagar.count()).toBe(1);
    });

    it('POST /duplicidade: 403 sem permissão e 400 com corpo inválido', async () => {
      const sem = await criarUsuarioTeste(app, { permissoes: ['financeiro.contas-pagar.ver'] });
      await comUsuario(app, sem).post(`${BASE}/duplicidade`).send({}).expect(403);
      await http().post(`${BASE}/duplicidade`).send({ valor: -1 }).expect(400);
    });
  });

  describe('divergência na baixa e relatório (#163)', () => {
    it('baixa com valor diferente exige justificativa, e a divergência entra no relatório', async () => {
      const conta = await criarNoBanco('Energia', { valor: '300.00' });

      const sem = await http()
        .post(`${BASE}/${conta.id}/baixar`)
        .send({ dataPagamento: '2026-11-04', valorPago: 320 })
        .expect(422);
      expect(sem.body.code).toBe('CONTA_PAGAR_BAIXA_DIVERGENTE');
      expect(await prisma.contaPagarBaixa.count()).toBe(0);

      await http()
        .post(`${BASE}/${conta.id}/baixar`)
        .send({
          dataPagamento: '2026-11-04',
          valorPago: 320,
          justificativaDivergencia: 'Multa por atraso',
        })
        .expect(200);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: conta.id,
        before: { status: 'PENDENTE' },
        after: { status: 'PAGO' },
        userId: usuario.id,
      });

      const baixas = await http().get(`${BASE}/${conta.id}/baixas`).expect(200);
      expect(baixas.body[0]).toMatchObject({
        divergencia: '20',
        justificativaDivergencia: 'Multa por atraso',
      });

      const relatorio = await http().get(`${BASE}/divergencias`).expect(200);
      expect(contaPagarDivergenciaPageSchema.parse(relatorio.body).data).toEqual([
        expect.objectContaining({
          contaPagarId: conta.id,
          descricao: 'Energia',
          valor: '300',
          valorPago: '320',
          divergencia: '20',
          justificativa: 'Multa por atraso',
          dataPagamento: '2026-11-04',
        }),
      ]);
    });

    it('baixa sem diferença não entra no relatório; juros e desconto não geram divergência', async () => {
      const exata = await criarNoBanco('Exata', { valor: '100.00' });
      await http()
        .post(`${BASE}/${exata.id}/baixar`)
        .send({ dataPagamento: '2026-11-04', valorPago: 100 })
        .expect(200);
      const comJuros = await criarNoBanco('Com juros', { valor: '100.00' });
      await http()
        .post(`${BASE}/${comJuros.id}/baixar`)
        .send({ dataPagamento: '2026-11-04', valorPago: 100, juros: 10, desconto: 2 })
        .expect(200);
      const relatorio = await http().get(`${BASE}/divergencias`).expect(200);
      expect(relatorio.body.data).toEqual([]);
    });

    it('pagamento parcial intencional não é divergência; baixa cancelada sai do relatório', async () => {
      const conta = await criarNoBanco('Energia', { valor: '300.00' });
      await http()
        .post(`${BASE}/${conta.id}/baixar`)
        .send({ dataPagamento: '2026-11-04', valorPago: 100, pagamentoParcial: true })
        .expect(200);
      expect((await http().get(`${BASE}/divergencias`).expect(200)).body.data).toEqual([]);

      await http()
        .post(`${BASE}/${conta.id}/baixar`)
        .send({
          dataPagamento: '2026-11-05',
          valorPago: 250,
          justificativaDivergencia: 'Pago a mais por engano',
        })
        .expect(200);
      expect((await http().get(`${BASE}/divergencias`).expect(200)).body.data).toHaveLength(1);

      await http().post(`${BASE}/${conta.id}/cancelar-baixa`).expect(200);
      expect((await http().get(`${BASE}/divergencias`).expect(200)).body.data).toEqual([]);
    });

    it('relatório filtra por período de pagamento, ordena e respeita a permissão', async () => {
      const a = await criarNoBanco('A', { valor: '100.00' });
      const b = await criarNoBanco('B', { valor: '100.00' });
      const pagar = (id: string, data: string, valorPago: number) =>
        http()
          .post(`${BASE}/${id}/baixar`)
          .send({ dataPagamento: data, valorPago, justificativaDivergencia: 'Ajuste' })
          .expect(200);
      await pagar(a.id, '2026-10-05', 90);
      await pagar(b.id, '2026-11-05', 130);

      const novembro = await http()
        .get(`${BASE}/divergencias`)
        .query({ pagamentoDe: '2026-11-01', pagamentoAte: '2026-11-30' })
        .expect(200);
      expect(novembro.body.data.map((d: { descricao: string }) => d.descricao)).toEqual(['B']);

      const porDivergencia = await http()
        .get(`${BASE}/divergencias`)
        .query({ sort: 'divergencia:asc' })
        .expect(200);
      expect(porDivergencia.body.data.map((d: { divergencia: string }) => d.divergencia)).toEqual([
        '-10',
        '30',
      ]);

      await http().get(`${BASE}/divergencias`).query({ sort: 'x:asc' }).expect(400);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(`${BASE}/divergencias`).expect(403);
    });

    it('exporta o relatório em xlsx e audita EXPORT', async () => {
      const conta = await criarNoBanco('ENERGIA NOVEMBRO', { valor: '100.00' });
      await http()
        .post(`${BASE}/${conta.id}/baixar`)
        .send({ dataPagamento: '2026-11-04', valorPago: 120, justificativaDivergencia: 'Multa' })
        .expect(200);
      const res = await http()
        .get(`${BASE}/divergencias/export`)
        .query({ format: 'xlsx' })
        .buffer(true)
        .parse(binario)
        .expect(200);
      const wb = new Workbook();
      await wb.xlsx.load(res.body);
      expect(JSON.stringify(wb.worksheets[0]?.getSheetValues() ?? [])).toContain(
        'ENERGIA NOVEMBRO',
      );
      expect(
        await prisma.auditLog.count({
          where: { entity: 'ContaPagarDivergencia', action: 'EXPORT' },
        }),
      ).toBe(1);
      await http().get(`${BASE}/divergencias/export`).expect(400);
    });
  });

  describe('DELETE /:id', () => {
    it('200: exclusão lógica e audita DELETE', async () => {
      const conta = await criarNoBanco('Água');
      await http().delete(`${BASE}/${conta.id}`).expect(200);

      const banco = await prisma.contaPagar.findUniqueOrThrow({ where: { id: conta.id } });
      expect(banco.deletedAt).not.toBeNull();
      await http().get(`${BASE}/${conta.id}`).expect(404);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: conta.id,
        before: { descricao: 'Água' },
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
      await criarNoBanco('AGUA CUIABA OUTUBRO');
      const res = await http()
        .get(`${BASE}/export`)
        .query({ format: 'xlsx' })
        .buffer(true)
        .parse(binario)
        .expect(200);

      const wb = new Workbook();
      await wb.xlsx.load(res.body);
      const linhas = wb.worksheets[0]?.getSheetValues() ?? [];
      expect(JSON.stringify(linhas)).toContain('AGUA CUIABA OUTUBRO');
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
