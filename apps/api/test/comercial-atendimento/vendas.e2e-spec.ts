import type { INestApplication } from '@nestjs/common';
import {
  catalogoVendaPageSchema,
  consultaRealizadaPageSchema,
  MSG_VENDA_SEM_ITENS,
  totaisConsultasRealizadasSchema,
  vendaPageSchema,
  vendaSchema,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/vendas';
const CONSULTAS = `${BASE}/consultas`;
const PERMISSOES = [
  'comercial-atendimento.vendas-pdv.ver',
  'comercial-atendimento.vendas-pdv.criar',
  'comercial-atendimento.vendas-pdv.exportar',
] as const;
const INEXISTENTE = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

const baixar = (r: request.Response, callback: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  (r as unknown as NodeJS.ReadableStream).on('data', (chunk: Buffer) => chunks.push(chunk));
  (r as unknown as NodeJS.ReadableStream).on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Vendas/PDV (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let produtoId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    produtoId = (
      await prisma.produto.create({
        data: { nome: 'Soro Teste', tipo: 'SERVICO', precoVenda: 250 },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const semPermissao = async () =>
    comUsuario(app, await criarUsuarioTeste(app, { permissoes: [] }));
  const item = (extra: Record<string, unknown> = {}) => ({
    origem: 'produto',
    origemId: produtoId,
    descricao: 'Soro Teste',
    quantidade: 2,
    valorUnitario: 250,
    ...extra,
  });

  describe('Consultas Realizadas', () => {
    let forma: { id: string };

    beforeEach(async () => {
      const paciente = await prisma.paciente.create({
        data: { nome: 'Ana Paciente', celular: '11900000000' },
      });
      const profissional = await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste' } });
      const tipo = await prisma.tipoAgendamento.create({
        data: { nome: 'Procedimento', duracaoMinutos: 30 },
      });
      forma = await prisma.formaPagamento.create({
        data: { nome: 'Voucher', finalidade: 'RECEBER', tipo: 'PAGAMENTO' },
      });
      const base = {
        pacienteId: paciente.id,
        profissionalId: profissional.id,
        tipoAgendamentoId: tipo.id,
        duracaoMinutos: 30,
      };
      const agendar = (inicio: string, extra: Record<string, unknown>) =>
        prisma.agendamento.create({ data: { ...base, inicio: new Date(inicio), ...extra } });
      await agendar('2026-10-10T11:00:00Z', { status: 'ATENDIDO', valor: 295 });
      await agendar('2026-10-09T20:00:00Z', {
        status: 'ATENDIDO',
        valor: 250,
        formaPagamentoId: forma.id,
        pagoEm: new Date('2026-10-09T21:00:00Z'),
      });
      await agendar('2026-09-15T12:00:00Z', { status: 'ATENDIDO', valor: 100 });
      await agendar('2026-10-10T12:00:00Z', { status: 'AGENDADO', valor: 999 });
      await agendar('2026-10-10T13:00:00Z', {
        status: 'ATENDIDO',
        valor: 888,
        deletedAt: new Date(),
      });
    });

    it('200: lista só atendidos não excluídos, com paciente, tipo e pagamento', async () => {
      const res = await http().get(CONSULTAS).expect(200);
      const page = consultaRealizadaPageSchema.parse(res.body);
      expect(page.data.map((c) => c.valor)).toEqual(['295', '250', '100']);
      expect(page.data[0]).toMatchObject({
        paciente: 'Ana Paciente',
        pacienteTelefone: '11900000000',
        profissional: 'Dra. Ana Teste',
        tipo: 'Procedimento',
        pago: false,
        formaPagamento: null,
      });
      expect(page.data[1]).toMatchObject({ pago: true, formaPagamento: 'Voucher' });
      expect(page.meta.total).toBe(3);
    });

    it('filtra por período (dia da clínica) e por pagamento; ordena e pagina', async () => {
      const valores = async (query: Record<string, string | number>) =>
        (await http().get(CONSULTAS).query(query).expect(200)).body.data.map(
          (c: { valor: string }) => c.valor,
        );
      expect(await valores({ de: '2026-10-01', ate: '2026-10-30' })).toEqual(['295', '250']);
      expect(await valores({ de: '2026-10-10' })).toEqual(['295']);
      expect(await valores({ ate: '2026-10-09' })).toEqual(['250', '100']);
      expect(await valores({ pagamento: 'pago' })).toEqual(['250']);
      expect(await valores({ pagamento: 'pendente' })).toEqual(['295', '100']);
      expect(await valores({ sort: 'valor:asc' })).toEqual(['100', '250', '295']);
      expect(await valores({ sort: 'pagamento:asc', pageSize: 1, page: 2 })).toHaveLength(1);
    });

    it('400 para período invertido, data inexistente, sort e pagamento inválidos', async () => {
      await http().get(CONSULTAS).query({ de: '2026-10-30', ate: '2026-10-01' }).expect(400);
      await http().get(CONSULTAS).query({ de: '2026-02-31' }).expect(400);
      await http().get(CONSULTAS).query({ sort: 'x:asc' }).expect(400);
      await http().get(CONSULTAS).query({ pagamento: 'x' }).expect(400);
    });

    it('403 sem permissão e 401 sem login', async () => {
      await (await semPermissao()).get(CONSULTAS).expect(403);
      await request(app.getHttpServer()).get(CONSULTAS).expect(401);
    });

    it('totais: cards seguem o período e o filtro; Recebido soma só os pagos', async () => {
      const todos = await http().get(`${CONSULTAS}/totais`).expect(200);
      expect(totaisConsultasRealizadasSchema.parse(todos.body)).toEqual({
        totalConsultas: 3,
        valorTotal: '645',
        recebido: '250',
      });
      const outubro = await http()
        .get(`${CONSULTAS}/totais`)
        .query({ de: '2026-10-01', ate: '2026-10-30', pagamento: 'pendente' })
        .expect(200);
      expect(outubro.body).toEqual({ totalConsultas: 1, valorTotal: '295', recebido: '0' });
    });

    it('totais: 400 para filtro inválido e 403 sem permissão', async () => {
      await http().get(`${CONSULTAS}/totais`).query({ de: 'x' }).expect(400);
      await (await semPermissao()).get(`${CONSULTAS}/totais`).expect(403);
    });

    it('export: 200 xlsx e audita EXPORT; 400 formato inválido; 403 sem permissão', async () => {
      const res = await http()
        .get(`${CONSULTAS}/export`)
        .query({ format: 'xlsx', pagamento: 'pago' })
        .buffer(true)
        .parse(baixar)
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: 'Agendamento',
        entityId: '*',
        userId: usuario.id,
      });
      await http().get(`${CONSULTAS}/export`).query({ format: 'doc' }).expect(400);
      await (await semPermissao()).get(`${CONSULTAS}/export`).query({ format: 'xlsx' }).expect(403);
    });
  });

  describe('GET (listagem de vendas)', () => {
    beforeEach(async () => {
      const ana = (await prisma.paciente.create({ data: { nome: 'Ana Cliente' } })).id;
      const bruno = (await prisma.paciente.create({ data: { nome: 'Bruno Cliente' } })).id;
      const venda = (pacienteId: string | null, total: number, extra: object = {}) =>
        prisma.venda.create({ data: { pacienteId, subtotal: total, total, ...extra } });
      await venda(ana, 300);
      await venda(bruno, 100, { status: 'CANCELADA' });
      await venda(null, 200, { status: 'ORCAMENTO_APROVADO' });
      await venda(ana, 999, { deletedAt: new Date() });
    });

    it('200: lista sem excluídas, com cliente e meta', async () => {
      const res = await http().get(BASE).expect(200);
      const page = vendaPageSchema.parse(res.body);
      expect(page.data.map((v) => v.cliente).sort()).toEqual([
        'Ana Cliente',
        'Bruno Cliente',
        null,
      ]);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
    });

    it('filtra por status e busca por cliente, ordena e pagina', async () => {
      const totais = async (query: Record<string, string | number>) =>
        (await http().get(BASE).query(query).expect(200)).body.data.map(
          (v: { total: string }) => v.total,
        );
      expect(await totais({ status: 'cancelada' })).toEqual(['100']);
      expect(await totais({ status: 'orcamento-aprovado' })).toEqual(['200']);
      expect(await totais({ status: 'finalizada' })).toEqual(['300']);
      expect(await totais({ search: 'bruno' })).toEqual(['100']);
      expect(await totais({ sort: 'total:asc' })).toEqual(['100', '200', '300']);
      expect(await totais({ sort: 'cliente:asc', pageSize: 1, page: 2 })).toHaveLength(1);
    });

    it('400 para sort e status inválidos', async () => {
      await http().get(BASE).query({ sort: 'x:asc' }).expect(400);
      await http().get(BASE).query({ status: 'x' }).expect(400);
    });

    it('403 sem permissão e 401 sem login', async () => {
      await (await semPermissao()).get(BASE).expect(403);
      await request(app.getHttpServer()).get(BASE).expect(401);
    });
  });

  describe('POST (Finalizar Venda)', () => {
    it('201: grava Finalizada, recalcula os totais no servidor e audita CREATE', async () => {
      const paciente = await prisma.paciente.create({ data: { nome: 'Ana Cliente' } });
      const forma = await prisma.formaPagamento.create({
        data: { nome: 'Pix', finalidade: 'RECEBER', tipo: 'PIX' },
      });
      const res = await http()
        .post(BASE)
        .send({
          pacienteId: paciente.id,
          formaPagamentoId: forma.id,
          parcelas: 3,
          desconto: 50,
          itens: [item(), item({ quantidade: 1, valorUnitario: 100 })],
        })
        .expect(201);

      expect(vendaSchema.parse(res.body)).toMatchObject({
        status: 'FINALIZADA',
        cliente: 'Ana Cliente',
        formaPagamento: 'Pix',
        parcelas: 3,
        desconto: '50',
        subtotal: '600',
        total: '550',
      });
      expect(res.body.itens.map((i: { total: string }) => i.total)).toEqual(['500', '100']);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Venda',
        entityId: res.body.id,
        before: null,
        after: { status: 'FINALIZADA', total: '550' },
        userId: usuario.id,
      });
    });

    it('201 sem cliente e sem forma de pagamento (cliente opcional)', async () => {
      const res = await http()
        .post(BASE)
        .send({ itens: [item()] })
        .expect(201);
      expect(res.body).toMatchObject({
        cliente: null,
        formaPagamento: null,
        parcelas: 1,
        total: '500',
      });
    });

    it('400 "Adicione ao menos um item." sem itens, sem auditar', async () => {
      for (const corpo of [{}, { itens: [] }]) {
        const res = await http().post(BASE).send(corpo).expect(400);
        expect(res.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'itens', message: MSG_VENDA_SEM_ITENS }),
          ]),
        );
      }
      await expectNoAudit(prisma, { entity: 'Venda' });
    });

    it('400 para item, parcelas e desconto inválidos', async () => {
      await http()
        .post(BASE)
        .send({ itens: [item({ quantidade: 0 })] })
        .expect(400);
      await http()
        .post(BASE)
        .send({ itens: [item()], parcelas: 0 })
        .expect(400);
      await http()
        .post(BASE)
        .send({ itens: [item()], desconto: -1 })
        .expect(400);
      await expectNoAudit(prisma, { entity: 'Venda' });
    });

    it('404 quando cliente, forma de pagamento ou item não existem', async () => {
      await http()
        .post(BASE)
        .send({ pacienteId: INEXISTENTE, itens: [item()] })
        .expect(404);
      await http()
        .post(BASE)
        .send({ formaPagamentoId: INEXISTENTE, itens: [item()] })
        .expect(404);
      await http()
        .post(BASE)
        .send({ itens: [item({ origemId: INEXISTENTE })] })
        .expect(404);
      await http()
        .post(BASE)
        .send({ itens: [item({ origem: 'protocolo', origemId: INEXISTENTE })] })
        .expect(404);
      await expectNoAudit(prisma, { entity: 'Venda' });
    });

    it('403 sem permissão de criar', async () => {
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.vendas-pdv.ver'],
      });
      await comUsuario(app, sem)
        .post(BASE)
        .send({ itens: [item()] })
        .expect(403);
    });
  });

  describe('GET /catalogo', () => {
    it('lista produtos/serviços ativos com categoria e preço, e filtra pela busca', async () => {
      await prisma.produto.create({
        data: { nome: 'Inativo', tipo: 'PRODUTO', precoVenda: 1, ativo: false },
      });
      const res = await http().get(`${BASE}/catalogo`).query({ tipo: 'produto' }).expect(200);
      const page = catalogoVendaPageSchema.parse(res.body);
      expect(page.data).toEqual([{ id: produtoId, nome: 'Soro Teste', detalhe: null, valor: 250 }]);
      const busca = await http()
        .get(`${BASE}/catalogo`)
        .query({ tipo: 'produto', search: 'zzz' })
        .expect(200);
      expect(busca.body.data).toEqual([]);
    });

    it('lista protocolos pelo valor total', async () => {
      await prisma.protocolo.create({ data: { nome: 'Protocolo 1', valorTotal: 90 } });
      const p = await http().get(`${BASE}/catalogo`).query({ tipo: 'protocolo' }).expect(200);
      expect(p.body.data[0]).toMatchObject({ nome: 'Protocolo 1', valor: 90 });
    });

    it('400 sem tipo e 403 sem permissão de criar', async () => {
      await http().get(`${BASE}/catalogo`).expect(400);
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.vendas-pdv.ver'],
      });
      await comUsuario(app, sem).get(`${BASE}/catalogo`).query({ tipo: 'produto' }).expect(403);
    });
  });

  describe('GET /export', () => {
    it('200 xlsx e audita EXPORT; 400 formato inválido; 403 sem permissão', async () => {
      await prisma.venda.create({ data: { subtotal: 10, total: 10 } });
      const res = await http()
        .get(`${BASE}/export`)
        .query({ format: 'xlsx' })
        .buffer(true)
        .parse(baixar)
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: 'Venda',
        entityId: '*',
        userId: usuario.id,
      });
      await http().get(`${BASE}/export`).query({ format: 'doc' }).expect(400);
      await (await semPermissao()).get(`${BASE}/export`).query({ format: 'xlsx' }).expect(403);
    });
  });
});
