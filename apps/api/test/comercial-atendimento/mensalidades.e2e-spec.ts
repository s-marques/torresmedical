import type { INestApplication } from '@nestjs/common';
import {
  gerarTitulosMensalidadesResumoSchema,
  mensalidadePageSchema,
  mensalidadeSchema,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/mensalidades';
const ENTITY = 'Mensalidade';
const PERMISSOES = [
  'comercial-atendimento.mensalidades.ver',
  'comercial-atendimento.mensalidades.criar',
  'comercial-atendimento.mensalidades.editar',
  'comercial-atendimento.mensalidades.exportar',
] as const;
const INEXISTENTE = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

const data = (valor: string) => new Date(`${valor}T00:00:00Z`);

describe('Mensalidades (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let pacienteId: string;
  let formaPagamentoId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    pacienteId = (await prisma.paciente.create({ data: { nome: 'Ana Cliente' } })).id;
    formaPagamentoId = (
      await prisma.formaPagamento.create({
        data: { nome: 'PIX', finalidade: 'RECEBER', tipo: 'PIX' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const corpo = (extra: Record<string, unknown> = {}) => ({
    pacienteId,
    descricao: 'Plano mensal fisioterapia',
    valor: 150,
    diaVencimento: 10,
    dataInicio: '2026-11-01',
    ...extra,
  });

  function criarNoBanco(
    extra: Partial<{
      descricao: string;
      pacienteId: string;
      valor: number;
      diaVencimento: number;
      formaPagamentoId: string | null;
      dataInicio: Date;
      dataFim: Date | null;
      status: 'ATIVO' | 'PAUSADO' | 'CANCELADO';
      deletedAt: Date;
    }> = {},
  ) {
    return prisma.mensalidade.create({
      data: {
        pacienteId,
        descricao: 'Mensalidade',
        valor: 100,
        diaVencimento: 10,
        dataInicio: data('2026-01-01'),
        ...extra,
      },
    });
  }

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      const bruno = (await prisma.paciente.create({ data: { nome: 'Bruno Cliente' } })).id;
      await criarNoBanco({ descricao: 'Ativa A', valor: 300, diaVencimento: 5 });
      await criarNoBanco({ descricao: 'Ativa B', pacienteId: bruno, valor: 200 });
      await criarNoBanco({ descricao: 'Pausada', status: 'PAUSADO', diaVencimento: 20 });
      await criarNoBanco({ descricao: 'Cancelada', status: 'CANCELADO' });
      await criarNoBanco({ descricao: 'Excluída', deletedAt: new Date() });
    });

    const descricoes = async (query: Record<string, string | number> = {}) =>
      (
        await http()
          .get(BASE)
          .query({ sort: 'descricao:asc', ...query })
          .expect(200)
      ).body.data.map((m: { descricao: string }) => m.descricao);

    it('200: lista sem excluídas, com cliente e meta', async () => {
      const res = await http().get(BASE).expect(200);
      const page = mensalidadePageSchema.parse(res.body);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 4, totalPages: 1 });
      expect(page.data.find((m) => m.descricao === 'Ativa A')).toMatchObject({
        cliente: 'Ana Cliente',
        valor: '300',
        diaVencimento: 5,
        dataInicio: '2026-01-01',
        dataFim: null,
        status: 'ATIVO',
      });
    });

    it('filtra pelas abas de status', async () => {
      expect(await descricoes({ status: 'ATIVO' })).toEqual(['Ativa A', 'Ativa B']);
      expect(await descricoes({ status: 'PAUSADO' })).toEqual(['Pausada']);
      expect(await descricoes({ status: 'CANCELADO' })).toEqual(['Cancelada']);
    });

    it('busca por cliente ou descrição', async () => {
      expect(await descricoes({ search: 'bruno' })).toEqual(['Ativa B']);
      expect(await descricoes({ search: 'pausa' })).toEqual(['Pausada']);
    });

    it('ordena pelas colunas e pagina', async () => {
      expect((await descricoes({ sort: 'valor:desc', pageSize: 1 }))[0]).toBe('Ativa A');
      expect((await descricoes({ sort: 'diaVencimento:desc', pageSize: 1 }))[0]).toBe('Pausada');
      expect((await descricoes({ sort: 'cliente:desc', pageSize: 1 }))[0]).toBe('Ativa B');
      expect(await descricoes({ sort: 'dataInicio:asc', pageSize: 3, page: 2 })).toHaveLength(1);
      expect(await descricoes({ sort: 'dataFim:asc' })).toHaveLength(4);
      expect(await descricoes({ sort: 'status:asc' })).toHaveLength(4);
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
    it('200, 404 e 400', async () => {
      const criada = await criarNoBanco({ formaPagamentoId });
      const res = await http().get(`${BASE}/${criada.id}`).expect(200);
      expect(mensalidadeSchema.parse(res.body)).toMatchObject({ formaPagamentoId });
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      await http().get(`${BASE}/nao-e-uuid`).expect(400);
    });
  });

  describe('POST (Nova Mensalidade)', () => {
    it('201: cria ativa e audita CREATE', async () => {
      const res = await http()
        .post(BASE)
        .send(
          corpo({ formaPagamentoId, dataFim: '2027-10-31', observacoes: ' Obs ', valor: 150.5 }),
        )
        .expect(201);
      expect(mensalidadeSchema.parse(res.body)).toMatchObject({
        cliente: 'Ana Cliente',
        descricao: 'Plano mensal fisioterapia',
        valor: '150.5',
        diaVencimento: 10,
        formaPagamentoId,
        dataInicio: '2026-11-01',
        dataFim: '2027-10-31',
        observacoes: 'Obs',
        status: 'ATIVO',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { descricao: 'Plano mensal fisioterapia', status: 'ATIVO' },
        userId: usuario.id,
      });
    });

    it('400 com os campos obrigatórios vazios, sem auditar', async () => {
      const res = await http().post(BASE).send({}).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'pacienteId', message: 'Cliente é obrigatório.' },
          { field: 'descricao', message: 'Descrição é obrigatória.' },
          { field: 'valor', message: 'Valor é obrigatório.' },
          { field: 'diaVencimento', message: 'Dia de vencimento é obrigatório.' },
          { field: 'dataInicio', message: 'Data de início é obrigatória.' },
        ]),
      );
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para dia, valor e datas inválidos', async () => {
      await http()
        .post(BASE)
        .send(corpo({ diaVencimento: 29 }))
        .expect(400);
      await http()
        .post(BASE)
        .send(corpo({ valor: 0 }))
        .expect(400);
      await http()
        .post(BASE)
        .send(corpo({ dataFim: '2026-10-01' }))
        .expect(400);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 no campo quando cliente ou forma de pagamento não servem', async () => {
      const semCliente = await http()
        .post(BASE)
        .send(corpo({ pacienteId: INEXISTENTE }))
        .expect(400);
      expect(semCliente.body.details).toEqual([
        { field: 'pacienteId', message: 'Cliente inválido' },
      ]);
      const pagar = await prisma.formaPagamento.create({
        data: { nome: 'Boleto a pagar', finalidade: 'PAGAR', tipo: 'BOLETO' },
      });
      const inativa = await prisma.formaPagamento.create({
        data: { nome: 'Cheque', finalidade: 'RECEBER', tipo: 'DINHEIRO', ativo: false },
      });
      for (const id of [INEXISTENTE, pagar.id, inativa.id]) {
        const res = await http()
          .post(BASE)
          .send(corpo({ formaPagamentoId: id }))
          .expect(400);
        expect(res.body.details).toEqual([
          { field: 'formaPagamentoId', message: 'Forma de pagamento inválida' },
        ]);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('403 sem permissão de criar', async () => {
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.mensalidades.ver'],
      });
      await comUsuario(app, sem).post(BASE).send(corpo()).expect(403);
    });
  });

  describe('PATCH /:id (Editar)', () => {
    it('200: altera e audita UPDATE com before/after', async () => {
      const criada = await http().post(BASE).send(corpo()).expect(201);
      const res = await http()
        .patch(`${BASE}/${criada.body.id}`)
        .send(corpo({ descricao: 'Plano novo', valor: 180 }))
        .expect(200);
      expect(res.body).toMatchObject({ descricao: 'Plano novo', valor: '180' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: criada.body.id,
        before: { descricao: 'Plano mensal fisioterapia' },
        after: { descricao: 'Plano novo', valor: '180' },
        userId: usuario.id,
      });
    });

    it('mantém a forma de pagamento atual mesmo se ela foi desativada', async () => {
      const criada = await criarNoBanco({ formaPagamentoId });
      await prisma.formaPagamento.update({
        where: { id: formaPagamentoId },
        data: { ativo: false },
      });
      await http().patch(`${BASE}/${criada.id}`).send(corpo({ formaPagamentoId })).expect(200);
    });

    it('422 para mensalidade cancelada, sem auditar', async () => {
      const cancelada = await criarNoBanco({ status: 'CANCELADO' });
      const res = await http().patch(`${BASE}/${cancelada.id}`).send(corpo()).expect(422);
      expect(res.body.code).toBe('MENSALIDADE_CANCELADA');
      await expectNoAudit(prisma, { entity: ENTITY, action: 'UPDATE' });
    });

    it('400, 404 e 403', async () => {
      const criada = await criarNoBanco();
      await http()
        .patch(`${BASE}/${criada.id}`)
        .send(corpo({ descricao: '' }))
        .expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}`).send(corpo()).expect(404);
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.mensalidades.ver'],
      });
      await comUsuario(app, sem).patch(`${BASE}/${criada.id}`).send(corpo()).expect(403);
      await expectNoAudit(prisma, { entity: ENTITY, action: 'UPDATE' });
    });
  });

  describe('PATCH /:id/status (Pausar, Reativar, Cancelar)', () => {
    it('pausa, reativa e cancela, auditando cada mudança', async () => {
      const criada = await criarNoBanco();
      const url = `${BASE}/${criada.id}/status`;

      const pausada = await http().patch(url).send({ status: 'PAUSADO' }).expect(200);
      expect(pausada.body.status).toBe('PAUSADO');
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: criada.id,
        before: { status: 'ATIVO' },
        after: { status: 'PAUSADO' },
        userId: usuario.id,
      });

      await http().patch(url).send({ status: 'ATIVO' }).expect(200);
      const cancelada = await http().patch(url).send({ status: 'CANCELADO' }).expect(200);
      expect(cancelada.body.status).toBe('CANCELADO');
      expect(await prisma.auditLog.count({ where: { entity: ENTITY, action: 'UPDATE' } })).toBe(3);
    });

    it('422 para mudança não permitida (cancelada não volta)', async () => {
      const cancelada = await criarNoBanco({ status: 'CANCELADO' });
      const res = await http()
        .patch(`${BASE}/${cancelada.id}/status`)
        .send({ status: 'ATIVO' })
        .expect(422);
      expect(res.body).toMatchObject({
        code: 'MENSALIDADE_STATUS_INVALIDO',
        message: 'Não é possível mudar a mensalidade de Cancelado para Ativo.',
      });
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400, 404 e 403', async () => {
      const criada = await criarNoBanco();
      await http().patch(`${BASE}/${criada.id}/status`).send({ status: 'X' }).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}/status`).send({ status: 'PAUSADO' }).expect(404);
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.mensalidades.ver'],
      });
      await comUsuario(app, sem)
        .patch(`${BASE}/${criada.id}/status`)
        .send({ status: 'PAUSADO' })
        .expect(403);
    });
  });

  describe('POST /gerar-titulos (Gerar Titulos do Mes)', () => {
    const gerar = (competencia: string) =>
      http().post(`${BASE}/gerar-titulos`).send({ competencia });

    it('gera um título por mensalidade ativa e vigente, sem duplicar, e audita', async () => {
      const vigente = await criarNoBanco({
        descricao: 'Plano A',
        valor: 150,
        diaVencimento: 10,
        formaPagamentoId,
      });
      await criarNoBanco({ descricao: 'Começa no fim do mês', dataInicio: data('2026-11-30') });
      await criarNoBanco({ descricao: 'Pausada', status: 'PAUSADO' });
      await criarNoBanco({ descricao: 'Cancelada', status: 'CANCELADO' });
      await criarNoBanco({ descricao: 'Encerrada', dataFim: data('2026-10-31') });
      await criarNoBanco({ descricao: 'Futura', dataInicio: data('2026-12-01') });
      await criarNoBanco({ descricao: 'Excluída', deletedAt: new Date() });

      const res = await gerar('2026-11').expect(200);
      expect(gerarTitulosMensalidadesResumoSchema.parse(res.body)).toEqual({
        competencia: '2026-11',
        geradas: 2,
        jaExistentes: 0,
      });

      const contas = await prisma.contaReceber.findMany({ orderBy: { descricao: 'asc' } });
      expect(contas.map((c) => c.descricao)).toEqual([
        'Mensalidade - Começa no fim do mês',
        'Mensalidade - Plano A',
      ]);
      const contaPlanoA = contas[1];
      expect(contaPlanoA).toMatchObject({ pacienteId, formaPagamentoId, status: 'PENDENTE' });
      expect(contaPlanoA?.valor.toString()).toBe('150');
      expect(contaPlanoA?.dataVencimento.toISOString().slice(0, 10)).toBe('2026-11-10');

      const titulo = await prisma.mensalidadeTitulo.findFirstOrThrow({
        where: { mensalidadeId: vigente.id },
      });
      expect(titulo).toMatchObject({ competencia: '2026-11', contaReceberId: contaPlanoA?.id });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'MensalidadeTitulo',
        entityId: titulo.id,
        after: { competencia: '2026-11' },
        userId: usuario.id,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ContaReceber',
        entityId: contaPlanoA?.id ?? '',
        userId: usuario.id,
      });

      const deNovo = await gerar('2026-11').expect(200);
      expect(deNovo.body).toEqual({ competencia: '2026-11', geradas: 0, jaExistentes: 2 });
      expect(await prisma.contaReceber.count()).toBe(2);

      const proximo = await gerar('2026-12').expect(200);
      expect(proximo.body).toMatchObject({ geradas: 3, jaExistentes: 0 });
    });

    it('400 para competência inválida e 403 sem permissão de criar', async () => {
      await gerar('2026-13').expect(400);
      await http().post(`${BASE}/gerar-titulos`).send({}).expect(400);
      const sem = await criarUsuarioTeste(app, {
        permissoes: ['comercial-atendimento.mensalidades.ver'],
      });
      await comUsuario(app, sem)
        .post(`${BASE}/gerar-titulos`)
        .send({ competencia: '2026-11' })
        .expect(403);
      expect(await prisma.contaReceber.count()).toBe(0);
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
        permissoes: ['comercial-atendimento.mensalidades.ver'],
      });
      await comUsuario(app, sem).get(`${BASE}/export`).query({ format: 'xlsx' }).expect(403);
    });
  });

  describe('escopo de dados (issue #153)', () => {
    async function cenario() {
      const medico = await prisma.profissional.create({ data: { nome: 'Dra. Escopo' } });
      const outro = await prisma.profissional.create({ data: { nome: 'Dr. Fora' } });
      const pacienteFora = (await prisma.paciente.create({ data: { nome: 'Paciente Fora' } })).id;
      await prisma.atendimento.createMany({
        data: [
          { pacienteId, profissionalId: medico.id, queixa: 'Queixa A' },
          { pacienteId: pacienteFora, profissionalId: outro.id, queixa: 'Queixa B' },
        ],
      });
      const doVinculado = await criarNoBanco({ descricao: 'Do vinculado' });
      const deFora = await criarNoBanco({ descricao: 'De fora', pacienteId: pacienteFora });
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [medico.id],
      });
      return { pacienteFora, doVinculado, deFora, http: () => comUsuario(app, restrito) };
    }

    it('lista e exporta só as mensalidades dos pacientes vinculados', async () => {
      const c = await cenario();
      const res = await c.http().get(BASE).expect(200);
      expect(res.body.data.map((m: { descricao: string }) => m.descricao)).toEqual([
        'Do vinculado',
      ]);
      await c.http().get(`${BASE}/export`).query({ format: 'xlsx' }).expect(200);
    });

    it('403 ao ler, editar, mudar status ou criar para paciente fora do escopo', async () => {
      const c = await cenario();
      await c.http().get(`${BASE}/${c.doVinculado.id}`).expect(200);
      await c.http().get(`${BASE}/${c.deFora.id}`).expect(403);
      await c.http().patch(`${BASE}/${c.deFora.id}`).send(corpo()).expect(403);
      await c.http().patch(`${BASE}/${c.deFora.id}/status`).send({ status: 'PAUSADO' }).expect(403);
      await c
        .http()
        .post(BASE)
        .send(corpo({ pacienteId: c.pacienteFora }))
        .expect(403);
      await c.http().post(BASE).send(corpo()).expect(201);
      expect(await prisma.mensalidade.count({ where: { pacienteId: c.pacienteFora } })).toBe(1);
    });

    it('403 em Gerar Títulos do Mês (cobrança em lote) para perfil restrito', async () => {
      const c = await cenario();
      await c.http().post(`${BASE}/gerar-titulos`).send({ competencia: '2026-11' }).expect(403);
      expect(await prisma.contaReceber.count()).toBe(0);
    });
  });
});
