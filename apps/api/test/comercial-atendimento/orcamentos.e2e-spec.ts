import type { INestApplication } from '@nestjs/common';
import {
  catalogoOrcamentoPageSchema,
  MSG_ORCAMENTO_SEM_ITENS,
  orcamentoPageSchema,
  orcamentoSchema,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/orcamentos';
const ENTITY = 'Orcamento';
const PERMISSOES = [
  'comercial-atendimento.orcamentos.ver',
  'comercial-atendimento.orcamentos.criar',
  'comercial-atendimento.orcamentos.exportar',
] as const;

describe('Orçamentos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let servicoId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    const profissional = await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste' } });
    servicoId = (
      await prisma.servicoProfissional.create({
        data: { profissionalId: profissional.id, nome: 'Acupuntura', valor: 250 },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const item = (extra: Record<string, unknown> = {}) => ({
    origem: 'servico',
    origemId: servicoId,
    descricao: 'Acupuntura',
    quantidade: 2,
    valorUnitario: 250,
    desconto: 50,
    ...extra,
  });

  function criarNoBanco(
    pacienteId: string | null,
    extra: Partial<{
      status: 'PENDENTE' | 'APROVADO' | 'CONCLUIDO' | 'CANCELADO';
      total: number;
      deletedAt: Date;
    }> = {},
  ) {
    const { total = 100, ...resto } = extra;
    return prisma.orcamento.create({ data: { pacienteId, subtotal: total, total, ...resto } });
  }

  describe('GET (listagem)', () => {
    let ana: string;
    beforeEach(async () => {
      ana = (await prisma.paciente.create({ data: { nome: 'Ana Cliente' } })).id;
      const bruno = (await prisma.paciente.create({ data: { nome: 'Bruno Cliente' } })).id;
      await criarNoBanco(ana, { total: 300 });
      await criarNoBanco(bruno, { status: 'APROVADO', total: 100 });
      await criarNoBanco(null, { status: 'CANCELADO', total: 200 });
      await criarNoBanco(ana, { deletedAt: new Date() });
    });

    it('200: lista sem excluídos, com cliente e meta', async () => {
      const res = await http().get(BASE).expect(200);
      const page = orcamentoPageSchema.parse(res.body);
      expect(page.data.map((o) => o.cliente).sort()).toEqual([
        'Ana Cliente',
        'Bruno Cliente',
        null,
      ]);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
    });

    it('filtra por status e busca por cliente, ordena e pagina', async () => {
      const totais = async (query: Record<string, string | number>) =>
        (await http().get(BASE).query(query).expect(200)).body.data.map(
          (o: { total: string }) => o.total,
        );
      expect(await totais({ status: 'aprovado' })).toEqual(['100']);
      expect(await totais({ status: 'cancelado' })).toEqual(['200']);
      expect(await totais({ search: 'bruno' })).toEqual(['100']);
      expect(await totais({ sort: 'total:asc' })).toEqual(['100', '200', '300']);
      expect(await totais({ sort: 'cliente:asc', pageSize: 1, page: 2 })).toHaveLength(1);
      // Aba Orçamento do Atendimento Médico (#38): só os do paciente.
      expect(await totais({ pacienteId: ana })).toEqual(['300']);
    });

    it('400 para sort e status inválidos', async () => {
      await http().get(BASE).query({ sort: 'x:asc' }).expect(400);
      await http().get(BASE).query({ status: 'x' }).expect(400);
      await http().get(BASE).query({ pacienteId: 'abc' }).expect(400);
    });

    it('403 sem permissão e 401 sem login', async () => {
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(BASE).expect(403);
      await request(app.getHttpServer()).get(BASE).expect(401);
    });
  });

  describe('POST (Criar Orçamento)', () => {
    it('201: cria Pendente, recalcula os totais no servidor e audita CREATE', async () => {
      const paciente = await prisma.paciente.create({ data: { nome: 'Ana Cliente' } });
      const forma = await prisma.formaPagamento.create({
        data: { nome: 'Pix', finalidade: 'RECEBER', tipo: 'DINHEIRO' },
      });
      const res = await http()
        .post(BASE)
        .send({
          pacienteId: paciente.id,
          formaPagamentoId: forma.id,
          observacoes: ' Validade 30 dias ',
          descontoTipo: 'percentual',
          descontoValor: 10,
          itens: [item(), item({ desconto: 0, quantidade: 1 })],
        })
        .expect(201);

      expect(orcamentoSchema.parse(res.body)).toMatchObject({
        status: 'PENDENTE',
        cliente: 'Ana Cliente',
        formaPagamento: 'Pix',
        observacoes: 'Validade 30 dias',
        descontoTipo: 'percentual',
        subtotal: '700',
        total: '630',
      });
      expect(res.body.itens.map((i: { total: string }) => i.total)).toEqual(['450', '250']);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { status: 'PENDENTE', total: '630' },
        userId: usuario.id,
      });
    });

    it('201 sem cliente e sem forma de pagamento ("Não definida")', async () => {
      const res = await http()
        .post(BASE)
        .send({ itens: [item()] })
        .expect(201);
      expect(res.body).toMatchObject({ cliente: null, formaPagamento: null, total: '450' });
    });

    it('400 "Adicione ao menos um item." sem itens, sem auditar', async () => {
      for (const corpo of [{}, { itens: [] }]) {
        const res = await http().post(BASE).send(corpo).expect(400);
        expect(res.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'itens', message: MSG_ORCAMENTO_SEM_ITENS }),
          ]),
        );
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para item inválido e desconto percentual acima de 100', async () => {
      await http()
        .post(BASE)
        .send({ itens: [item({ quantidade: 0 })] })
        .expect(400);
      await http()
        .post(BASE)
        .send({ itens: [item({ desconto: 9999 })] })
        .expect(400);
      await http()
        .post(BASE)
        .send({ itens: [item()], descontoTipo: 'percentual', descontoValor: 101 })
        .expect(400);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('404 quando cliente, forma de pagamento ou serviço não existem', async () => {
      const inexistente = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
      await http()
        .post(BASE)
        .send({ pacienteId: inexistente, itens: [item()] })
        .expect(404);
      await http()
        .post(BASE)
        .send({ formaPagamentoId: inexistente, itens: [item()] })
        .expect(404);
      await http()
        .post(BASE)
        .send({ itens: [item({ origemId: inexistente })] })
        .expect(404);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('403 sem permissão de criar', async () => {
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.orcamentos.ver'],
      });
      await comUsuario(app, sem)
        .post(BASE)
        .send({ itens: [item()] })
        .expect(403);
    });
  });

  describe('GET /catalogo', () => {
    it('lista serviços ativos com profissional e preço, e filtra pela busca', async () => {
      const profissional = await prisma.profissional.findFirstOrThrow();
      await prisma.servicoProfissional.create({
        data: { profissionalId: profissional.id, nome: 'Inativo', valor: 1, ativo: false },
      });
      const res = await http().get(`${BASE}/catalogo`).query({ tipo: 'servico' }).expect(200);
      const page = catalogoOrcamentoPageSchema.parse(res.body);
      expect(page.data).toEqual([
        { id: servicoId, nome: 'Acupuntura', detalhe: 'Dra. Ana Teste', valor: 250 },
      ]);
      const busca = await http()
        .get(`${BASE}/catalogo`)
        .query({ tipo: 'servico', search: 'zzz' })
        .expect(200);
      expect(busca.body.data).toEqual([]);
    });

    it('lista protocolos e protocolos mãe pelo valor total', async () => {
      await prisma.protocolo.create({ data: { nome: 'Protocolo 1', valorTotal: 90 } });
      await prisma.protocoloMae.create({ data: { nome: 'Mãe 1', valorTotal: 900 } });
      const p = await http().get(`${BASE}/catalogo`).query({ tipo: 'protocolo' }).expect(200);
      expect(p.body.data[0]).toMatchObject({ nome: 'Protocolo 1', valor: 90 });
      const m = await http().get(`${BASE}/catalogo`).query({ tipo: 'protocolo-mae' }).expect(200);
      expect(m.body.data[0]).toMatchObject({ nome: 'Mãe 1', valor: 900 });
    });

    it('400 sem tipo e 403 sem permissão de criar', async () => {
      await http().get(`${BASE}/catalogo`).expect(400);
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.orcamentos.ver'],
      });
      await comUsuario(app, sem).get(`${BASE}/catalogo`).query({ tipo: 'servico' }).expect(403);
    });
  });

  describe('GET /export', () => {
    it('200 xlsx e audita EXPORT; 400 formato inválido; 403 sem permissão', async () => {
      await criarNoBanco(null);
      const res = await http()
        .get(`${BASE}/export`)
        .query({ format: 'xlsx' })
        .buffer(true)
        .parse((r, callback) => {
          const chunks: Buffer[] = [];
          r.on('data', (chunk: Buffer) => chunks.push(chunk));
          r.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTITY,
        entityId: '*',
        userId: usuario.id,
      });
      await http().get(`${BASE}/export`).query({ format: 'doc' }).expect(400);
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.orcamentos.ver'],
      });
      await comUsuario(app, sem).get(`${BASE}/export`).query({ format: 'xlsx' }).expect(403);
    });
  });
});
