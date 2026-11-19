import type { INestApplication } from '@nestjs/common';
import {
  catalogoPacotePageSchema,
  MSG_PACOTE_SEM_ITENS,
  pacotePageSchema,
  pacoteSchema,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/pacotes';
const ENTITY = 'Pacote';
const PERMISSOES = [
  'comercial-atendimento.pacotes.ver',
  'comercial-atendimento.pacotes.criar',
  'comercial-atendimento.pacotes.editar',
  'comercial-atendimento.pacotes.excluir',
  'comercial-atendimento.pacotes.exportar',
] as const;
const INEXISTENTE = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

const dia = (deslocamento: number) =>
  new Date(Date.now() + deslocamento * 86_400_000).toISOString().slice(0, 10);

describe('Pacotes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let pacienteId: string;
  let profissionalId: string;
  let produtoId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    pacienteId = (await prisma.paciente.create({ data: { nome: 'Ana Cliente' } })).id;
    profissionalId = (await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste' } })).id;
    produtoId = (
      await prisma.produto.create({
        data: { nome: 'Drenagem', tipo: 'SERVICO', precoVenda: 100 },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const corpo = (extra: Record<string, unknown> = {}) => ({
    pacienteId,
    nome: 'Pacote 10 sessões',
    itens: [{ produtoId, quantidade: 10 }],
    ...extra,
  });

  function criarNoBanco(
    extra: Partial<{
      nome: string;
      pacienteId: string;
      sessoesTotal: number;
      sessoesUsadas: number;
      valorTotal: number;
      dataVencimento: Date | null;
      status: 'ATIVO' | 'CANCELADO';
      deletedAt: Date;
    }> = {},
  ) {
    return prisma.pacote.create({
      data: {
        pacienteId,
        nome: 'Pacote',
        valorTotal: 100,
        sessoesTotal: 10,
        sessoesUsadas: 0,
        ...extra,
      },
    });
  }

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      const bruno = (await prisma.paciente.create({ data: { nome: 'Bruno Cliente' } })).id;
      await criarNoBanco({ nome: 'Ativo sem data', valorTotal: 300 });
      await criarNoBanco({
        nome: 'Ativo no prazo',
        valorTotal: 200,
        dataVencimento: new Date(`${dia(30)}T00:00:00Z`),
      });
      await criarNoBanco({
        nome: 'Vencido',
        pacienteId: bruno,
        valorTotal: 100,
        dataVencimento: new Date(`${dia(-5)}T00:00:00Z`),
      });
      await criarNoBanco({
        nome: 'Finalizado',
        sessoesUsadas: 10,
        // Saldo zerado vence sobre a data: não é "Vencido".
        dataVencimento: new Date(`${dia(-5)}T00:00:00Z`),
      });
      await criarNoBanco({ nome: 'Cancelado', status: 'CANCELADO' });
      await criarNoBanco({ nome: 'Excluído', deletedAt: new Date() });
    });

    const nomes = async (query: Record<string, string | number> = {}) =>
      (
        await http()
          .get(BASE)
          .query({ sort: 'nome:asc', ...query })
          .expect(200)
      ).body.data.map((p: { nome: string }) => p.nome);

    it('200: lista sem excluídos, com cliente, saldo, status calculado e meta', async () => {
      const res = await http().get(BASE).expect(200);
      const page = pacotePageSchema.parse(res.body);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 5, totalPages: 1 });
      const porNome = Object.fromEntries(page.data.map((p) => [p.nome, p]));
      expect(porNome['Ativo sem data']).toMatchObject({
        cliente: 'Ana Cliente',
        saldo: 10,
        status: 'ATIVO',
      });
      expect(porNome['Vencido']?.status).toBe('VENCIDO');
      expect(porNome['Finalizado']).toMatchObject({ saldo: 0, status: 'FINALIZADO' });
      expect(porNome['Cancelado']?.status).toBe('CANCELADO');
    });

    it('filtra pelos chips de status', async () => {
      expect(await nomes({ status: 'ativo' })).toEqual(['Ativo no prazo', 'Ativo sem data']);
      expect(await nomes({ status: 'vencido' })).toEqual(['Vencido']);
      expect(await nomes({ status: 'finalizado' })).toEqual(['Finalizado']);
      expect(await nomes({ status: 'cancelado' })).toEqual(['Cancelado']);
    });

    it('busca por cliente ou por nome do pacote', async () => {
      expect(await nomes({ search: 'bruno' })).toEqual(['Vencido']);
      expect(await nomes({ search: 'finaliz' })).toEqual(['Finalizado']);
    });

    it('ordena por colunas e pagina', async () => {
      expect(await nomes({ sort: 'valor:desc' })).toEqual(
        expect.arrayContaining(['Ativo sem data']),
      );
      const porValor = (await nomes({ sort: 'valor:desc', pageSize: 1 }))[0];
      expect(porValor).toBe('Ativo sem data');
      expect(await nomes({ sort: 'cliente:asc', pageSize: 2, page: 3 })).toHaveLength(1);
      expect(await nomes({ sort: 'vencimento:asc' })).toHaveLength(5);
      expect(await nomes({ sort: 'status:asc' })).toHaveLength(5);
    });

    it('400 para sort e status inválidos', async () => {
      await http().get(BASE).query({ sort: 'x:asc' }).expect(400);
      await http().get(BASE).query({ status: 'x' }).expect(400);
    });

    it('403 sem permissão e 401 sem login', async () => {
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(BASE).expect(403);
      await request(app.getHttpServer()).get(BASE).expect(401);
    });
  });

  describe('GET /:id', () => {
    it('200 com itens, progresso e histórico; 404 e 400', async () => {
      const criado = await http().post(BASE).send(corpo()).expect(201);
      const res = await http().get(`${BASE}/${criado.body.id}`).expect(200);
      expect(pacoteSchema.parse(res.body)).toMatchObject({
        nome: 'Pacote 10 sessões',
        sessoesTotal: 10,
        saldo: 10,
        usos: [],
      });
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      await http().get(`${BASE}/nao-e-uuid`).expect(400);
    });
  });

  describe('POST (Novo Pacote)', () => {
    it('201: soma os itens com o preço do cadastro e audita CREATE', async () => {
      const res = await http()
        .post(BASE)
        .send(
          corpo({
            descricao: ' Dreno ',
            dataInicio: dia(0),
            dataVencimento: dia(30),
            profissionalId,
            observacoes: 'Obs',
          }),
        )
        .expect(201);

      expect(pacoteSchema.parse(res.body)).toMatchObject({
        cliente: 'Ana Cliente',
        profissional: 'Dra. Ana Teste',
        descricao: 'Dreno',
        valorTotal: '1000',
        sessoesTotal: 10,
        saldo: 10,
        status: 'ATIVO',
        itens: [{ descricao: 'Drenagem', quantidade: 10, valorUnitario: '100', usadas: 0 }],
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { nome: 'Pacote 10 sessões', sessoesTotal: 10 },
        userId: usuario.id,
      });
    });

    it('201: valor total informado sobrescreve a soma e o preço do front é ignorado', async () => {
      const res = await http()
        .post(BASE)
        .send(
          corpo({
            valorTotal: 750.5,
            itens: [{ produtoId, quantidade: 2 }],
          }),
        )
        .expect(201);
      expect(res.body).toMatchObject({ valorTotal: '750.5', sessoesTotal: 2 });
      expect(res.body.itens[0].valorUnitario).toBe('100');
    });

    it('400 com os campos obrigatórios vazios, sem auditar', async () => {
      const res = await http().post(BASE).send({}).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'pacienteId', message: 'Cliente é obrigatório.' }),
          expect.objectContaining({ field: 'nome', message: 'Nome do Pacote é obrigatório.' }),
          expect.objectContaining({ field: 'itens', message: MSG_PACOTE_SEM_ITENS }),
        ]),
      );
      await http()
        .post(BASE)
        .send(corpo({ itens: [] }))
        .expect(400);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para quantidade, datas e valor inválidos', async () => {
      await http()
        .post(BASE)
        .send(corpo({ itens: [{ produtoId, quantidade: 0 }] }))
        .expect(400);
      await http()
        .post(BASE)
        .send(corpo({ valorTotal: -1 }))
        .expect(400);
      await http()
        .post(BASE)
        .send(corpo({ dataInicio: '31/12/2026' }))
        .expect(400);
      await http()
        .post(BASE)
        .send(corpo({ dataInicio: dia(10), dataVencimento: dia(1) }))
        .expect(400);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('404 quando cliente, profissional ou produto não existem', async () => {
      await http()
        .post(BASE)
        .send(corpo({ pacienteId: INEXISTENTE }))
        .expect(404);
      await http()
        .post(BASE)
        .send(corpo({ profissionalId: INEXISTENTE }))
        .expect(404);
      await http()
        .post(BASE)
        .send(corpo({ itens: [{ produtoId: INEXISTENTE, quantidade: 1 }] }))
        .expect(404);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('403 sem permissão de criar', async () => {
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.pacotes.ver'],
      });
      await comUsuario(app, sem).post(BASE).send(corpo()).expect(403);
    });
  });

  describe('PATCH /:id (Editar)', () => {
    it('200: troca dados e itens e audita UPDATE com before/after', async () => {
      const criado = await http().post(BASE).send(corpo()).expect(201);
      const res = await http()
        .patch(`${BASE}/${criado.body.id}`)
        .send(corpo({ nome: 'Novo nome', itens: [{ produtoId, quantidade: 4 }] }))
        .expect(200);
      expect(res.body).toMatchObject({ nome: 'Novo nome', sessoesTotal: 4, valorTotal: '400' });
      expect(res.body.itens).toHaveLength(1);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: criado.body.id,
        before: { nome: 'Pacote 10 sessões', sessoesTotal: 10 },
        after: { nome: 'Novo nome', sessoesTotal: 4 },
        userId: usuario.id,
      });
    });

    it('422: não deixa o total de sessões abaixo das já usadas', async () => {
      const criado = await http().post(BASE).send(corpo()).expect(201);
      await http()
        .post(`${BASE}/${criado.body.id}/usos`)
        .send({ profissionalId, quantidade: 6 })
        .expect(201);
      const res = await http()
        .patch(`${BASE}/${criado.body.id}`)
        .send(corpo({ itens: [{ produtoId, quantidade: 5 }] }))
        .expect(422);
      expect(res.body.code).toBe('BUSINESS_RULE');
    });

    it('400, 404 e 403', async () => {
      const criado = await http().post(BASE).send(corpo()).expect(201);
      await http().patch(`${BASE}/${criado.body.id}`).send({}).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}`).send(corpo()).expect(404);
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.pacotes.ver'],
      });
      await comUsuario(app, sem).patch(`${BASE}/${criado.body.id}`).send(corpo()).expect(403);
    });
  });

  describe('DELETE /:id', () => {
    it('200: exclusão lógica, some da listagem e audita DELETE', async () => {
      const criado = await http().post(BASE).send(corpo()).expect(201);
      await http().delete(`${BASE}/${criado.body.id}`).expect(200);
      expect((await http().get(BASE).expect(200)).body.data).toEqual([]);
      expect(await prisma.pacote.count({ where: { id: criado.body.id } })).toBe(1);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: criado.body.id,
        before: { nome: 'Pacote 10 sessões' },
        userId: usuario.id,
      });
    });

    it('404 e 403', async () => {
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      const criado = await http().post(BASE).send(corpo()).expect(201);
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.pacotes.ver'],
      });
      await comUsuario(app, sem).delete(`${BASE}/${criado.body.id}`).expect(403);
    });
  });

  describe('POST /:id/usos (Registrar Uso de Sessão)', () => {
    let id: string;
    beforeEach(async () => {
      const dois = (
        await prisma.produto.create({
          data: { nome: 'Massagem', tipo: 'SERVICO', precoVenda: 50 },
        })
      ).id;
      id = (
        await http()
          .post(BASE)
          .send(
            corpo({
              itens: [
                { produtoId, quantidade: 2 },
                { produtoId: dois, quantidade: 3 },
              ],
            }),
          )
          .expect(201)
      ).body.id;
    });

    it('201: baixa o saldo, abate os itens na ordem e audita UPDATE do pacote', async () => {
      const res = await http()
        .post(`${BASE}/${id}/usos`)
        .send({ profissionalId, quantidade: 3, observacoes: ' Sessão ok ' })
        .expect(201);
      expect(pacoteSchema.parse(res.body)).toMatchObject({
        sessoesUsadas: 3,
        saldo: 2,
        status: 'ATIVO',
        usos: [{ profissional: 'Dra. Ana Teste', quantidade: 3, observacoes: 'Sessão ok' }],
      });
      expect(res.body.itens.map((i: { usadas: number }) => i.usadas)).toEqual([2, 1]);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: id,
        before: { sessoesUsadas: 0 },
        after: { sessoesUsadas: 3 },
        userId: usuario.id,
      });
    });

    it('quantidade padrão é 1 e o pacote vira Finalizado ao zerar o saldo', async () => {
      const um = await http().post(`${BASE}/${id}/usos`).send({ profissionalId }).expect(201);
      expect(um.body.usos[0].quantidade).toBe(1);
      const fim = await http()
        .post(`${BASE}/${id}/usos`)
        .send({ profissionalId, quantidade: 4 })
        .expect(201);
      expect(fim.body).toMatchObject({ saldo: 0, status: 'FINALIZADO' });
    });

    it('422 quando passa do saldo ou o pacote está cancelado', async () => {
      const passou = await http()
        .post(`${BASE}/${id}/usos`)
        .send({ profissionalId, quantidade: 6 })
        .expect(422);
      expect(passou.body.message).toBe('O pacote tem apenas 5 sessão(ões) de saldo.');
      await prisma.pacote.update({ where: { id }, data: { status: 'CANCELADO' } });
      await http().post(`${BASE}/${id}/usos`).send({ profissionalId }).expect(422);
    });

    it('400 sem profissional e quantidade inválida; 404 profissional e pacote', async () => {
      const res = await http().post(`${BASE}/${id}/usos`).send({}).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'profissionalId',
            message: 'Profissional é obrigatório.',
          }),
        ]),
      );
      await http().post(`${BASE}/${id}/usos`).send({ profissionalId, quantidade: 0 }).expect(400);
      await http().post(`${BASE}/${id}/usos`).send({ profissionalId: INEXISTENTE }).expect(404);
      await http().post(`${BASE}/${INEXISTENTE}/usos`).send({ profissionalId }).expect(404);
    });

    it('403 sem permissão de editar', async () => {
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.pacotes.ver'],
      });
      await comUsuario(app, sem).post(`${BASE}/${id}/usos`).send({ profissionalId }).expect(403);
    });

    it('DELETE /:id/usos/:usoId devolve a sessão ao saldo e audita UPDATE', async () => {
      const usado = await http()
        .post(`${BASE}/${id}/usos`)
        .send({ profissionalId, quantidade: 2 })
        .expect(201);
      const usoId = usado.body.usos[0].id;
      const res = await http().delete(`${BASE}/${id}/usos/${usoId}`).expect(200);
      expect(res.body).toMatchObject({ sessoesUsadas: 0, saldo: 5, usos: [] });
      // Há dois UPDATE do mesmo pacote (o uso e a remoção): confere o mais recente.
      const [ultimo] = await prisma.auditLog.findMany({
        where: { entity: ENTITY, entityId: id, action: 'UPDATE' },
        orderBy: { occurredAt: 'desc' },
      });
      expect(ultimo?.before).toMatchObject({ sessoesUsadas: 2 });
      expect(ultimo?.after).toMatchObject({ sessoesUsadas: 0 });
      expect(ultimo?.userId).toBe(usuario.id);
      await http().delete(`${BASE}/${id}/usos/${usoId}`).expect(404);
      await http().delete(`${BASE}/${id}/usos/nao-e-uuid`).expect(400);
    });
  });

  describe('GET /catalogo', () => {
    it('lista produtos ativos com categoria e preço, e filtra pela busca', async () => {
      await prisma.produto.create({
        data: { nome: 'Inativo', tipo: 'PRODUTO', precoVenda: 1, ativo: false },
      });
      const res = await http().get(`${BASE}/catalogo`).expect(200);
      const page = catalogoPacotePageSchema.parse(res.body);
      expect(page.data).toEqual([{ id: produtoId, nome: 'Drenagem', categoria: null, valor: 100 }]);
      const busca = await http().get(`${BASE}/catalogo`).query({ search: 'zzz' }).expect(200);
      expect(busca.body.data).toEqual([]);
    });

    it('403 sem permissão de criar', async () => {
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.pacotes.ver'],
      });
      await comUsuario(app, sem).get(`${BASE}/catalogo`).expect(403);
    });
  });

  describe('GET /export', () => {
    it('200 xlsx e audita EXPORT; 400 formato inválido; 403 sem permissão', async () => {
      await criarNoBanco();
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
        permissoes: ['comercial-atendimento.pacotes.ver'],
      });
      await comUsuario(app, sem).get(`${BASE}/export`).query({ format: 'xlsx' }).expect(403);
    });
  });
});
